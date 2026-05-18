import { TriggerDirection } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { fetchPricesByIds, type SimplePriceItem } from '@/lib/services/coingecko';
import { sendPriceAlert, TelegramError } from '@/lib/services/telegram';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';

export interface PriceUpdaterResult {
  pricesUpdated: number;
  balancesRecalculated: number;
  snapshotsCreated: number;
  triggersChecked: number;
  notificationsSent: number;
  errors: number;
  durationMs: number;
}

export async function runPriceUpdater(): Promise<PriceUpdaterResult> {
  const startedAt = Date.now();
  let pricesUpdated = 0;
  let balancesRecalculated = 0;
  let snapshotsCreated = 0;
  let triggersChecked = 0;
  let notificationsSent = 0;
  let errors = 0;

  try {
    // 1. Збираємо всі унікальні tokenId з тригерів + з кешу цін з ненульовою кількістю
    const tokenIds = await collectActiveTokenIds();

    let prices = new Map<string, SimplePriceItem>();
    if (tokenIds.length > 0) {
      prices = await fetchPricesByIds(tokenIds);
      pricesUpdated = prices.size;

      // 2. Зберегти ціни в БД (TokenPrice + PriceHistory)
      await persistPrices(prices);
    }

    // 3. Перерахувати USD вартість балансів на основі оновлених цін
    balancesRecalculated = await recalculateBalances();

    // 4. Snapshots — створити нові для кожного користувача з гаманцями (не частіше ніж раз на годину)
    snapshotsCreated = await createSnapshotsForActiveUsers();

    // 5. Перевірити тригери
    const result = await checkTriggers(prices);
    triggersChecked = result.checked;
    notificationsSent = result.notified;
    errors = result.errors;
  } catch (err) {
    console.error('[price-updater] unexpected error:', err);
    errors++;
  }

  return {
    pricesUpdated,
    balancesRecalculated,
    snapshotsCreated,
    triggersChecked,
    notificationsSent,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

async function collectActiveTokenIds(): Promise<string[]> {
  const [triggers, balances, topCached] = await Promise.all([
    prisma.priceTrigger.findMany({
      where: { isActive: true },
      select: { tokenId: true },
      distinct: ['tokenId'],
    }),
    prisma.tokenBalance.findMany({
      where: { coingeckoId: { not: null } },
      select: { coingeckoId: true },
      distinct: ['coingeckoId'],
    }),
    prisma.tokenPrice.findMany({
      orderBy: { marketCap: 'desc' },
      take: 100,
      select: { tokenId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const t of triggers) if (t.tokenId) ids.add(t.tokenId);
  for (const b of balances) if (b.coingeckoId) ids.add(b.coingeckoId);
  for (const p of topCached) ids.add(p.tokenId);
  return Array.from(ids);
}

async function persistPrices(prices: Map<string, SimplePriceItem>): Promise<void> {
  const now = new Date();
  await Promise.all(
    Array.from(prices.values()).map(async (p) => {
      await prisma.tokenPrice.upsert({
        where: { tokenId: p.id },
        create: {
          tokenId: p.id,
          symbol: p.symbol ?? p.id,
          name: p.name ?? p.id,
          currentPrice: p.price,
          priceChange24h: p.change24h,
          marketCap: p.marketCap ?? null,
          volume24h: p.volume24h ?? null,
          logoUrl: p.image ?? null,
        },
        update: {
          currentPrice: p.price,
          priceChange24h: p.change24h,
          marketCap: p.marketCap ?? null,
          volume24h: p.volume24h ?? null,
          ...(p.image ? { logoUrl: p.image } : {}),
        },
      });
      await prisma.priceHistory.create({
        data: { tokenId: p.id, price: p.price, timestamp: now },
      });
    }),
  );
}

async function recalculateBalances(): Promise<number> {
  const balances = await prisma.tokenBalance.findMany({
    where: { coingeckoId: { not: null } },
  });
  if (balances.length === 0) return 0;

  const ids = Array.from(new Set(balances.map((b) => b.coingeckoId).filter((id): id is string => !!id)));
  const cached = await prisma.tokenPrice.findMany({
    where: { tokenId: { in: ids } },
  });
  const priceMap = new Map(
    cached.map((c) => [c.tokenId, { price: c.currentPrice, change24h: c.priceChange24h }]),
  );

  let updated = 0;
  for (const b of balances) {
    const entry = b.coingeckoId ? priceMap.get(b.coingeckoId) : null;
    if (!entry || typeof entry.price !== 'number') continue;
    const newUsd = b.balance * entry.price;
    const usdChanged = Math.abs(newUsd - b.usdValue) >= 0.01;
    const priceChanged = Math.abs(entry.price - b.priceUsd) >= 1e-9;
    const changeChanged = Math.abs(entry.change24h - b.priceChange24h) >= 1e-6;
    if (!usdChanged && !priceChanged && !changeChanged) continue;
    await prisma.tokenBalance.update({
      where: { id: b.id },
      data: {
        usdValue: newUsd,
        priceUsd: entry.price,
        priceChange24h: entry.change24h,
      },
    });
    updated++;
  }
  return updated;
}

async function createSnapshotsForActiveUsers(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const usersWithWallets = await prisma.user.findMany({
    where: {
      isBlocked: false,
      wallets: { some: {} },
    },
    select: { id: true },
  });

  let created = 0;
  for (const u of usersWithWallets) {
    const latest = await prisma.portfolioSnapshot.findFirst({
      where: { userId: u.id },
      orderBy: { timestamp: 'desc' },
    });
    if (latest && latest.timestamp > oneHourAgo) continue;
    await savePortfolioSnapshot(u.id);
    created++;
  }
  return created;
}

interface CheckTriggersResult {
  checked: number;
  notified: number;
  errors: number;
}

async function checkTriggers(
  prices: Map<string, SimplePriceItem>,
): Promise<CheckTriggersResult> {
  const triggers = await prisma.priceTrigger.findMany({
    where: { isActive: true },
    include: {
      user: { select: { telegramChatId: true, isBlocked: true } },
    },
  });

  const result: CheckTriggersResult = { checked: 0, notified: 0, errors: 0 };
  const now = new Date();

  for (const trigger of triggers) {
    result.checked++;
    if (trigger.user.isBlocked) continue;

    const priceData = prices.get(trigger.tokenId);
    const currentPrice = priceData?.price;
    if (typeof currentPrice !== 'number' || currentPrice <= 0) continue;

    if (trigger.lastPrice === null) {
      await prisma.priceTrigger.update({
        where: { id: trigger.id },
        data: { lastPrice: currentPrice, lastCheckedAt: now },
      });
      continue;
    }

    const intervalMs = trigger.interval * 60 * 1000;
    if (trigger.lastCheckedAt && now.getTime() - trigger.lastCheckedAt.getTime() < intervalMs) {
      continue;
    }

    const delta = ((currentPrice - trigger.lastPrice) / trigger.lastPrice) * 100;
    const absDelta = Math.abs(delta);

    const shouldNotify =
      absDelta >= trigger.threshold &&
      directionMatches(trigger.direction, delta) &&
      !!trigger.user.telegramChatId;

    if (shouldNotify && trigger.user.telegramChatId) {
      try {
        await sendPriceAlert(trigger.user.telegramChatId, {
          tokenSymbol: trigger.tokenSymbol,
          tokenName: trigger.tokenName,
          deltaPercent: delta,
          price: currentPrice,
          intervalMinutes: trigger.interval,
        });
        await prisma.notificationLog.create({
          data: {
            userId: trigger.userId,
            triggerId: trigger.id,
            tokenSymbol: trigger.tokenSymbol,
            message: `${delta > 0 ? '+' : ''}${delta.toFixed(2)}% за ${trigger.interval}хв (${currentPrice})`,
            deltaPercent: delta,
            price: currentPrice,
            status: 'sent',
          },
        });
        result.notified++;
      } catch (err) {
        result.errors++;
        await prisma.notificationLog.create({
          data: {
            userId: trigger.userId,
            triggerId: trigger.id,
            tokenSymbol: trigger.tokenSymbol,
            message: err instanceof TelegramError ? err.message : 'Помилка надсилання',
            deltaPercent: delta,
            price: currentPrice,
            status: 'failed',
          },
        });
      }
    }

    await prisma.priceTrigger.update({
      where: { id: trigger.id },
      data: { lastPrice: currentPrice, lastCheckedAt: now },
    });
  }

  return result;
}

function directionMatches(direction: TriggerDirection, delta: number): boolean {
  switch (direction) {
    case TriggerDirection.UP:
      return delta > 0;
    case TriggerDirection.DOWN:
      return delta < 0;
    case TriggerDirection.BOTH:
      return true;
  }
}
