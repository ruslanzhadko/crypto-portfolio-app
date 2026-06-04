import { TriggerDirection, TriggerType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { fetchPricesByIds, type SimplePriceItem } from '@/lib/services/coingecko';
import { fetchPrices, type PriceQuery } from '@/lib/services/price-feed';
import { sendPriceAlert, sendPriceTargetAlert, TelegramError } from '@/lib/services/telegram';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';

// ─────────────────────────────────────────
// Public types
// ─────────────────────────────────────────

export interface PriceUpdaterResult {
  pricesUpdated: number;
  balancesRecalculated: number;
  snapshotsCreated: number;
  triggersChecked: number;
  notificationsSent: number;
  errors: number;
  durationMs: number;
}

// ─────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────

interface BalanceRow {
  id: string;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  balance: number;
  usdValue: number;
  priceUsd: number;
  priceChange24h: number;
  coingeckoId: string | null;
}

interface PriceInfo {
  price: number;
  change24h: number;
}

interface TriggerWithUser {
  id: string;
  userId: string;
  tokenId: string;
  tokenSymbol: string;
  tokenName: string;
  triggerType: TriggerType;
  threshold: number;
  targetPrice: number | null;
  direction: TriggerDirection;
  interval: number;
  lastPrice: number | null;
  lastCheckedAt: Date | null;
  user: { telegramChatId: string | null; isBlocked: boolean };
}

export interface TriggerEvaluation {
  shouldNotify: boolean;
  shouldUpdate: boolean;
  delta: number;
}

// ─────────────────────────────────────────
// Pure helpers — no I/O, fully unit-testable
// ─────────────────────────────────────────

function priceKey(chainName: string, tokenAddress: string): string {
  return `${chainName}::${tokenAddress === '' ? 'native' : tokenAddress}`;
}

function clampChange(value: number): number {
  return Math.max(-99.9, Math.min(value, 10_000));
}

function directionMatches(direction: TriggerDirection, delta: number): boolean {
  switch (direction) {
    case TriggerDirection.UP:   return delta > 0;
    case TriggerDirection.DOWN: return delta < 0;
    case TriggerDirection.BOTH: return true;
  }
}

/**
 * Determines whether a trigger should fire for a given price.
 * Pure — no side effects, safe to unit-test without mocking.
 */
export function evaluateTrigger(
  trigger: Pick<
    TriggerWithUser,
    'lastPrice' | 'lastCheckedAt' | 'interval' | 'threshold' | 'direction' | 'user'
  >,
  currentPrice: number,
  now: Date,
): TriggerEvaluation {
  if (trigger.lastPrice === null) {
    return { shouldNotify: false, shouldUpdate: true, delta: 0 };
  }

  const intervalMs = trigger.interval * 60 * 1000;
  const elapsed = trigger.lastCheckedAt
    ? now.getTime() - trigger.lastCheckedAt.getTime()
    : Infinity;

  if (elapsed < intervalMs) {
    return { shouldNotify: false, shouldUpdate: false, delta: 0 };
  }

  const delta = ((currentPrice - trigger.lastPrice) / trigger.lastPrice) * 100;
  const shouldNotify =
    Math.abs(delta) >= trigger.threshold &&
    directionMatches(trigger.direction, delta) &&
    !!trigger.user.telegramChatId &&
    !trigger.user.isBlocked;

  return { shouldNotify, shouldUpdate: true, delta };
}

/**
 * Builds a deduplicated map of price queries from balance rows.
 * Pure — no side effects, safe to unit-test without mocking.
 */
export function buildPriceQueries(balances: BalanceRow[]): Map<string, PriceQuery> {
  const queries = new Map<string, PriceQuery>();
  for (const b of balances) {
    const key = priceKey(b.chainName, b.tokenAddress);
    if (!queries.has(key)) {
      queries.set(key, {
        key,
        isNative: b.tokenAddress === '',
        chainName: b.chainName,
        contractAddress: b.tokenAddress === '' ? undefined : b.tokenAddress || undefined,
      });
    }
  }
  return queries;
}

/**
 * Returns the best available price for a balance row.
 * Priority: price-feed (Binance/DexScreener) → CoinGecko cache.
 * Pure — no side effects, safe to unit-test without mocking.
 */
export function resolveBalancePrice(
  b: BalanceRow,
  feedPrices: Map<string, PriceInfo>,
  cgPriceMap: Map<string, PriceInfo>,
): PriceInfo | null {
  const feed = feedPrices.get(priceKey(b.chainName, b.tokenAddress));
  if (feed) return feed;
  return b.coingeckoId ? (cgPriceMap.get(b.coingeckoId) ?? null) : null;
}

// ─────────────────────────────────────────
// Step 1 — Collect token IDs
// ─────────────────────────────────────────

async function collectTokenIds(): Promise<string[]> {
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

// ─────────────────────────────────────────
// Step 2 — Fetch & persist prices
// ─────────────────────────────────────────

async function persistPrices(prices: Map<string, SimplePriceItem>): Promise<void> {
  const now = new Date();
  // Sequential to avoid overwhelming the DB with concurrent upserts
  for (const p of prices.values()) {
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
  }
}

async function fetchAndPersistPrices(
  tokenIds: string[],
): Promise<Map<string, SimplePriceItem>> {
  const prices = await fetchPricesByIds(tokenIds);
  if (prices.size > 0) await persistPrices(prices);
  return prices;
}

// ─────────────────────────────────────────
// Step 3 — Recalculate balance USD values
// ─────────────────────────────────────────

async function recalculateBalances(): Promise<number> {
  const balances = await prisma.tokenBalance.findMany({
    where: { isSpam: false, balance: { gt: 0 } },
    select: {
      id: true,
      chainName: true,
      tokenAddress: true,
      tokenSymbol: true,
      balance: true,
      usdValue: true,
      priceUsd: true,
      priceChange24h: true,
      coingeckoId: true,
    },
  });
  if (balances.length === 0) return 0;

  const queries = buildPriceQueries(balances);
  const feedPrices = await fetchPrices(Array.from(queries.values())).catch(
    () => new Map<string, PriceInfo>(),
  );

  // CoinGecko cache as fallback for tokens the price-feed doesn't cover
  const cgIds = Array.from(
    new Set(
      balances
        .filter((b) => b.coingeckoId && !feedPrices.has(priceKey(b.chainName, b.tokenAddress)))
        .map((b) => b.coingeckoId!),
    ),
  );
  const cgRows =
    cgIds.length > 0
      ? await prisma.tokenPrice.findMany({
          where: { tokenId: { in: cgIds } },
          select: { tokenId: true, currentPrice: true, priceChange24h: true },
        })
      : [];
  const cgPriceMap = new Map<string, PriceInfo>(
    cgRows.map((c) => [c.tokenId, { price: c.currentPrice, change24h: c.priceChange24h }]),
  );

  let updated = 0;
  for (const b of balances) {
    const resolved = resolveBalancePrice(b, feedPrices, cgPriceMap);
    if (!resolved || resolved.price <= 0 || !Number.isFinite(resolved.price)) continue;

    const newUsd = b.balance * resolved.price;
    const newChange = clampChange(resolved.change24h);

    const unchanged =
      Math.abs(newUsd - b.usdValue) < 0.01 &&
      Math.abs(resolved.price - b.priceUsd) < 1e-9 &&
      Math.abs(newChange - b.priceChange24h) < 1e-6;
    if (unchanged) continue;

    await prisma.tokenBalance.update({
      where: { id: b.id },
      data: { usdValue: newUsd, priceUsd: resolved.price, priceChange24h: newChange },
    });
    updated++;
  }
  return updated;
}

// ─────────────────────────────────────────
// Step 4 — Portfolio snapshots
// ─────────────────────────────────────────

async function createSnapshots(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: { isBlocked: false, wallets: { some: {} } },
    select: { id: true },
  });

  let created = 0;
  for (const u of users) {
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

/**
 * Determines whether a PRICE_TARGET trigger should fire.
 * Fires when price crosses the target (lastPrice was on opposite side).
 * Pure — no side effects, safe to unit-test without mocking.
 */
export function evaluatePriceTargetTrigger(
  trigger: Pick<TriggerWithUser, 'lastPrice' | 'targetPrice' | 'direction' | 'user'>,
  currentPrice: number,
): boolean {
  const { lastPrice, targetPrice, direction, user } = trigger;
  if (lastPrice === null || targetPrice === null) return false;
  if (!user.telegramChatId || user.isBlocked) return false;

  if (direction === TriggerDirection.UP || direction === TriggerDirection.BOTH) {
    if (lastPrice < targetPrice && currentPrice >= targetPrice) return true;
  }
  if (direction === TriggerDirection.DOWN || direction === TriggerDirection.BOTH) {
    if (lastPrice > targetPrice && currentPrice <= targetPrice) return true;
  }
  return false;
}

// ─────────────────────────────────────────
// Step 5 — Price trigger evaluation
// ─────────────────────────────────────────

async function processPercentTrigger(
  trigger: TriggerWithUser,
  currentPrice: number,
  now: Date,
): Promise<'notified' | 'updated' | 'skipped' | 'error'> {
  const evaluation = evaluateTrigger(trigger, currentPrice, now);
  if (!evaluation.shouldUpdate) return 'skipped';

  if (evaluation.shouldNotify && trigger.user.telegramChatId) {
    try {
      await sendPriceAlert(trigger.user.telegramChatId, {
        tokenSymbol: trigger.tokenSymbol,
        tokenName: trigger.tokenName,
        deltaPercent: evaluation.delta,
        price: currentPrice,
        intervalMinutes: trigger.interval,
      });
      await prisma.notificationLog.create({
        data: {
          userId: trigger.userId,
          triggerId: trigger.id,
          tokenSymbol: trigger.tokenSymbol,
          message: `${evaluation.delta > 0 ? '+' : ''}${evaluation.delta.toFixed(2)}% за ${trigger.interval}хв ($${currentPrice})`,
          deltaPercent: evaluation.delta,
          price: currentPrice,
          status: 'sent',
        },
      });
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          userId: trigger.userId,
          triggerId: trigger.id,
          tokenSymbol: trigger.tokenSymbol,
          message: err instanceof TelegramError ? err.message : 'Помилка надсилання',
          deltaPercent: evaluation.delta,
          price: currentPrice,
          status: 'failed',
        },
      });
      await prisma.priceTrigger.update({
        where: { id: trigger.id },
        data: { lastPrice: currentPrice, lastCheckedAt: now },
      });
      return 'error';
    }
  }

  await prisma.priceTrigger.update({
    where: { id: trigger.id },
    data: { lastPrice: currentPrice, lastCheckedAt: now },
  });
  return evaluation.shouldNotify ? 'notified' : 'updated';
}

async function processPriceTargetTrigger(
  trigger: TriggerWithUser,
  currentPrice: number,
  now: Date,
): Promise<'notified' | 'updated' | 'skipped' | 'error'> {
  const shouldFire = evaluatePriceTargetTrigger(trigger, currentPrice);

  if (shouldFire && trigger.user.telegramChatId && trigger.targetPrice !== null) {
    const direction = trigger.direction === TriggerDirection.UP ? 'UP' : 'DOWN';
    try {
      await sendPriceTargetAlert(trigger.user.telegramChatId, {
        tokenSymbol: trigger.tokenSymbol,
        tokenName: trigger.tokenName,
        targetPrice: trigger.targetPrice,
        currentPrice,
        direction,
      });
      await Promise.all([
        prisma.notificationLog.create({
          data: {
            userId: trigger.userId,
            triggerId: trigger.id,
            tokenSymbol: trigger.tokenSymbol,
            message: `Ціль $${trigger.targetPrice} досягнута (${direction === 'UP' ? 'вище' : 'нижче'})`,
            deltaPercent: 0,
            price: currentPrice,
            status: 'sent',
          },
        }),
        // Deactivate after firing — price target is one-shot
        prisma.priceTrigger.update({
          where: { id: trigger.id },
          data: { lastPrice: currentPrice, lastCheckedAt: now, isActive: false },
        }),
      ]);
      return 'notified';
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          userId: trigger.userId,
          triggerId: trigger.id,
          tokenSymbol: trigger.tokenSymbol,
          message: err instanceof TelegramError ? err.message : 'Помилка надсилання',
          deltaPercent: 0,
          price: currentPrice,
          status: 'failed',
        },
      });
      return 'error';
    }
  }

  // Always update lastPrice so next run can detect the crossing
  await prisma.priceTrigger.update({
    where: { id: trigger.id },
    data: { lastPrice: currentPrice, lastCheckedAt: now },
  });
  return 'updated';
}

async function processTrigger(
  trigger: TriggerWithUser,
  prices: Map<string, SimplePriceItem>,
  now: Date,
): Promise<'notified' | 'updated' | 'skipped' | 'error'> {
  const currentPrice = prices.get(trigger.tokenId)?.price;
  if (typeof currentPrice !== 'number' || currentPrice <= 0) return 'skipped';

  if (trigger.triggerType === TriggerType.PRICE_TARGET) {
    return processPriceTargetTrigger(trigger, currentPrice, now);
  }
  return processPercentTrigger(trigger, currentPrice, now);
}

async function checkTriggers(
  prices: Map<string, SimplePriceItem>,
): Promise<{ checked: number; notified: number; errors: number }> {
  const triggers = await prisma.priceTrigger.findMany({
    where: { isActive: true },
    select: {
      id: true, userId: true, tokenId: true, tokenSymbol: true, tokenName: true,
      triggerType: true, threshold: true, targetPrice: true, direction: true,
      interval: true, lastPrice: true, lastCheckedAt: true,
      user: { select: { telegramChatId: true, isBlocked: true } },
    },
  });

  const result = { checked: 0, notified: 0, errors: 0 };
  const now = new Date();

  for (const trigger of triggers) {
    result.checked++;
    const outcome = await processTrigger(trigger, prices, now);
    if (outcome === 'notified') result.notified++;
    if (outcome === 'error') result.errors++;
  }

  return result;
}

// ─────────────────────────────────────────
// Pipeline orchestrator
// ─────────────────────────────────────────

export async function runPriceUpdater(): Promise<PriceUpdaterResult> {
  const startedAt = Date.now();
  const result: PriceUpdaterResult = {
    pricesUpdated: 0,
    balancesRecalculated: 0,
    snapshotsCreated: 0,
    triggersChecked: 0,
    notificationsSent: 0,
    errors: 0,
    durationMs: 0,
  };

  let prices = new Map<string, SimplePriceItem>();

  try {
    const tokenIds = await collectTokenIds();
    if (tokenIds.length > 0) {
      prices = await fetchAndPersistPrices(tokenIds);
      result.pricesUpdated = prices.size;
    }
  } catch (err) {
    result.errors++;
    console.error('[price-updater] step 1-2 (fetch prices):', err);
  }

  try {
    result.balancesRecalculated = await recalculateBalances();
  } catch (err) {
    result.errors++;
    console.error('[price-updater] step 3 (recalculate balances):', err);
  }

  try {
    result.snapshotsCreated = await createSnapshots();
  } catch (err) {
    result.errors++;
    console.error('[price-updater] step 4 (snapshots):', err);
  }

  try {
    const triggerResult = await checkTriggers(prices);
    result.triggersChecked = triggerResult.checked;
    result.notificationsSent = triggerResult.notified;
    result.errors += triggerResult.errors;
  } catch (err) {
    result.errors++;
    console.error('[price-updater] step 5 (triggers):', err);
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
