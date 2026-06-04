import { Network } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getChainDisplayName, getChainColor } from '@/lib/utils/networks';
import { fetchMarketChart } from '@/lib/services/coingecko';
import { computePortfolioValue, computeShare, computePnL } from '@/lib/services/portfolio-math';

export interface WalletTokenBreakdown {
  walletId: string;
  walletLabel: string | null;
  walletAddress: string;
  network: Network;
  chainName: string;
  balance: number;
  usdValue: number;
  share: number; // % від загальної кількості цього токена
}

export interface AggregatedToken {
  key: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  coingeckoId: string | null;
  totalBalance: number;
  totalUsd: number;
  share: number;
  chains: string[];
  walletIds: string[];
  wallets: WalletTokenBreakdown[];
  currentPrice: number;
  priceChange24h: number;
}

export interface ChainAllocation {
  chainName: string;
  displayName: string;
  color: string;
  totalUsd: number;
  share: number;
  tokenCount: number;
}

export interface PortfolioOverview {
  totalUsd: number;
  walletCount: number;
  tokenCount: number;
  priceChange24h: number;
  priceChange24hUsd: number;
  tokens: AggregatedToken[];
  chains: ChainAllocation[];
  topMovers: AggregatedToken[];
}

export async function getPortfolioOverview(userId: string): Promise<PortfolioOverview> {
  const wallets = await prisma.wallet.findMany({
    where: { userId },
    include: {
      balances: {
        where: { isSpam: false, isHidden: false },
      },
    },
  });

  // Fallback з TokenPrice cache за символом (для випадків коли priceUsd на балансі == 0)
  const priceCache = new Map<string, { price: number; change24h: number }>();
  const cachedPrices = await prisma.tokenPrice.findMany();
  for (const p of cachedPrices) {
    const k = p.symbol.toLowerCase();
    if (!priceCache.has(k)) {
      priceCache.set(k, { price: p.currentPrice, change24h: p.priceChange24h });
    }
  }

  const tokenMap = new Map<string, AggregatedToken>();
  const chainUsd = new Map<string, { total: number; tokenCount: number }>();

  // ─── Зважена 24г-зміна на рівні токена ───
  // Збираємо суму (priceChange × usdValue) і суму usdValue для кожного агрегованого токена,
  // щоб у фінальному значенні отримати USD-зважений середній % зміни.
  const changeAcc = new Map<string, { weighted: number; weight: number }>();

  for (const w of wallets) {
    for (const b of w.balances) {
      const key = b.tokenSymbol.toLowerCase();
      const cached = priceCache.get(key);

      // Fallback: priceUsd → з балансу, інакше з кешу, інакше з usdValue/balance
      const fallbackPriceFromUsd =
        b.balance > 0 && b.usdValue > 0 ? b.usdValue / b.balance : 0;
      const effectivePrice =
        b.priceUsd > 0
          ? b.priceUsd
          : cached?.price
            ? cached.price
            : fallbackPriceFromUsd;
      const rawChange =
        b.priceChange24h !== 0 ? b.priceChange24h : cached?.change24h ?? 0;
      const effectiveChange = Number.isFinite(rawChange) ? rawChange : 0;

      const existing = tokenMap.get(key);
      const breakdown: WalletTokenBreakdown = {
        walletId: w.id,
        walletLabel: w.label,
        walletAddress: w.address,
        network: w.network,
        chainName: b.chainName,
        balance: b.balance,
        usdValue: b.usdValue,
        share: 0, // обчислимо нижче
      };

      if (existing) {
        existing.totalBalance += b.balance;
        existing.totalUsd += b.usdValue;
        existing.wallets.push(breakdown);
        if (!existing.chains.includes(b.chainName)) {
          existing.chains.push(b.chainName);
        }
        if (!existing.walletIds.includes(w.id)) {
          existing.walletIds.push(w.id);
        }
        if (!existing.coingeckoId && b.coingeckoId) {
          existing.coingeckoId = b.coingeckoId;
        }
        if (!existing.logoUrl && b.logoUrl) {
          existing.logoUrl = b.logoUrl;
        }
        if (existing.currentPrice === 0 && effectivePrice > 0) {
          existing.currentPrice = effectivePrice;
        }
      } else {
        tokenMap.set(key, {
          key,
          symbol: b.tokenSymbol,
          name: b.tokenName,
          logoUrl: b.logoUrl,
          coingeckoId: b.coingeckoId,
          totalBalance: b.balance,
          totalUsd: b.usdValue,
          share: 0,
          chains: b.chainName ? [b.chainName] : [],
          walletIds: [w.id],
          wallets: [breakdown],
          currentPrice: effectivePrice,
          priceChange24h: 0, // підставимо нижче
        });
      }

      // USD-зважена 24г-зміна; ціна не може впасти більш ніж на 100% — клампуємо брудні дані
      const clampedChange =
        effectiveChange !== 0 ? Math.max(-99.9, Math.min(effectiveChange, 10_000)) : 0;
      if (clampedChange !== 0 && b.usdValue > 0) {
        const acc = changeAcc.get(key) ?? { weighted: 0, weight: 0 };
        changeAcc.set(key, {
          weighted: acc.weighted + clampedChange * b.usdValue,
          weight: acc.weight + b.usdValue,
        });
      }

      // Агрегація по ланцюгу
      if (b.chainName) {
        const chain = chainUsd.get(b.chainName) ?? { total: 0, tokenCount: 0 };
        chainUsd.set(b.chainName, {
          total: chain.total + b.usdValue,
          tokenCount: chain.tokenCount + 1,
        });
      }
    }
  }

  const totalUsd = computePortfolioValue(Array.from(tokenMap.values()).map((t) => t.totalUsd));

  for (const t of tokenMap.values()) {
    t.share = computeShare(t.totalUsd, totalUsd);

    // Розрахунок share для кожного гаманця всередині токена
    for (const w of t.wallets) {
      w.share = computeShare(w.usdValue, t.totalUsd);
    }
    // Сортуємо breakdown за USD-вартістю
    t.wallets.sort((a, b) => b.usdValue - a.usdValue);

    // USD-зважена 24г-зміна
    const acc = changeAcc.get(t.key);
    if (acc && acc.weight > 0) {
      t.priceChange24h = acc.weighted / acc.weight;
    }
  }

  const tokens = Array.from(tokenMap.values()).sort((a, b) => b.totalUsd - a.totalUsd);

  const chains: ChainAllocation[] = Array.from(chainUsd.entries())
    .map(([chainName, { total, tokenCount }]) => ({
      chainName,
      displayName: getChainDisplayName(chainName),
      color: getChainColor(chainName),
      totalUsd: total,
      share: computeShare(total, totalUsd),
      tokenCount,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  // Зважена зміна 24г на рівні портфеля.
  // Guard 1: change < -100 дає від'ємний знаменник → клампуємо до -99.9.
  // Guard 2: contribution обмежується [-totalUsd, +totalUsd*100], щоб один токен
  //          з підозрілими даними (-99.9%) не зруйнував весь портфельний показник.
  let priceChange24hUsd = 0;
  for (const t of tokens) {
    if (t.priceChange24h === 0) continue;
    const safeChange = Math.max(-99.9, t.priceChange24h);
    const prev = t.totalUsd / (1 + safeChange / 100);
    const contribution = t.totalUsd - prev;
    // Максимальний збиток = поточна вартість (ціна не може стати від'ємною)
    priceChange24hUsd += Math.max(contribution, -t.totalUsd);
  }
  const rawPriceChange24h = totalUsd > 0 ? (priceChange24hUsd / totalUsd) * 100 : 0;
  const priceChange24h = Number.isFinite(rawPriceChange24h) ? rawPriceChange24h : 0;

  const topMovers = [...tokens]
    .filter((t) => Number.isFinite(t.priceChange24h) && t.priceChange24h !== 0)
    .sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h))
    .slice(0, 5);

  return {
    totalUsd,
    walletCount: wallets.length,
    tokenCount: tokens.length,
    priceChange24h,
    priceChange24hUsd,
    tokens,
    chains,
    topMovers,
  };
}

// ─────────────────────────────────────────
// PnL
// ─────────────────────────────────────────

export interface PnLResult {
  current: number;
  initial: number;
  absolute: number;
  percent: number;
  periodDays: number;
}

export async function getPortfolioPnL(userId: string, periodDays = 30): Promise<PnLResult> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [latest, earliest] = await Promise.all([
    prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.portfolioSnapshot.findFirst({
      where: { userId, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  const current = latest?.totalUsd ?? 0;
  const initial = earliest?.totalUsd ?? current;
  const { absolute, percent } = computePnL(current, initial);

  return { current, initial, absolute, percent, periodDays };
}

// ─────────────────────────────────────────
// Snapshots
// ─────────────────────────────────────────

export interface SnapshotPoint {
  timestamp: number;
  totalUsd: number;
}

export interface SnapshotsResponse {
  points: SnapshotPoint[];
  source: 'snapshots' | 'reconstructed' | 'mixed' | 'empty';
}

/**
 * Повертає історію вартості портфеля.
 * Якщо у БД достатньо snapshot'ів — використовує їх (точно).
 * Інакше — реконструює з CoinGecko market_chart за поточними балансами (приблизно).
 */
export async function getPortfolioSnapshots(
  userId: string,
  periodDays = 30,
): Promise<SnapshotsResponse> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  });

  // Якщо snapshot'ів вистачає (>= 3 точок або період < 1 дня) — повертаємо їх
  if (snapshots.length >= 3 || (periodDays < 1 && snapshots.length > 0)) {
    return {
      points: snapshots.map((s) => ({
        timestamp: s.timestamp.getTime(),
        totalUsd: s.totalUsd,
      })),
      source: 'snapshots',
    };
  }

  // Інакше — реконструюємо з CoinGecko
  const reconstructed = await reconstructPortfolioHistory(userId, periodDays);
  if (reconstructed.length === 0 && snapshots.length === 0) {
    return { points: [], source: 'empty' };
  }
  if (snapshots.length === 0) {
    return { points: reconstructed, source: 'reconstructed' };
  }
  // Mixed: snapshot'и важливіші, доповнюємо реконструкцією
  const snapPoints = snapshots.map((s) => ({
    timestamp: s.timestamp.getTime(),
    totalUsd: s.totalUsd,
  }));
  return { points: mergePoints(reconstructed, snapPoints), source: 'mixed' };
}

// ─────────────────────────────────────────
// Реконструкція історії з CoinGecko
// ─────────────────────────────────────────

interface CachedReconstruction {
  fetchedAt: number;
  points: SnapshotPoint[];
}

const RECONSTRUCTION_CACHE = new Map<string, CachedReconstruction>();
const RECONSTRUCTION_TTL_MS = 2 * 60 * 1000; // 2 хв
const MAX_TOKENS_FOR_RECONSTRUCTION = 20;

async function reconstructPortfolioHistory(
  userId: string,
  periodDays: number,
): Promise<SnapshotPoint[]> {
  const cacheKey = `${userId}::${periodDays}`;
  const cached = RECONSTRUCTION_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < RECONSTRUCTION_TTL_MS) {
    return cached.points;
  }

  // Збираємо поточні баланси по coingeckoId (агрегуємо по всіх гаманцях)
  // usdValue >= 1 — пропускаємо пил, зменшуємо кількість API-запитів до CoinGecko
  const [balances, unknownBalances] = await Promise.all([
    prisma.tokenBalance.findMany({
      where: {
        wallet: { userId },
        coingeckoId: { not: null },
        isSpam: false,
        isHidden: false,
        balance: { gt: 0 },
        usdValue: { gte: 1 },
      },
      select: { coingeckoId: true, balance: true, usdValue: true },
    }),
    // Токени без coingeckoId — беремо їх поточну вартість як константу
    prisma.tokenBalance.findMany({
      where: {
        wallet: { userId },
        coingeckoId: null,
        isSpam: false,
        isHidden: false,
        balance: { gt: 0 },
        usdValue: { gte: 1 },
      },
      select: { usdValue: true },
    }),
  ]);

  const unknownTotal = unknownBalances.reduce((s, b) => s + b.usdValue, 0);

  const aggregated = new Map<string, { balance: number; usdValue: number }>();
  for (const b of balances) {
    if (!b.coingeckoId) continue;
    const prev = aggregated.get(b.coingeckoId) ?? { balance: 0, usdValue: 0 };
    aggregated.set(b.coingeckoId, {
      balance: prev.balance + b.balance,
      usdValue: prev.usdValue + b.usdValue,
    });
  }

  if (aggregated.size === 0 && unknownTotal === 0) return [];

  // Якщо є лише токени без coingeckoId — будуємо синтетичний плоский ряд
  if (aggregated.size === 0) {
    const bucketSize = periodDays <= 1 ? 60 * 60_000 : 24 * 60 * 60_000;
    const startMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const points: SnapshotPoint[] = [];
    for (let t = Math.ceil(startMs / bucketSize) * bucketSize; t <= Date.now(); t += bucketSize) {
      points.push({ timestamp: t, totalUsd: unknownTotal });
    }
    RECONSTRUCTION_CACHE.set(cacheKey, { fetchedAt: Date.now(), points });
    return points;
  }

  // Обмежуємо до топ-N по поточній USD-вартості (щоб не вибухнути по API ліміту)
  const topTokens = Array.from(aggregated.entries())
    .sort((a, b) => b[1].usdValue - a[1].usdValue)
    .slice(0, MAX_TOKENS_FOR_RECONSTRUCTION);

  const charts = await Promise.allSettled(
    topTokens.map(([id]) => fetchMarketChart(id, periodDays)),
  );

  // Бакетинг: для 1Д — по 1 годині, інакше — по 1 дню
  const bucketSize = periodDays <= 1 ? 60 * 60_000 : 24 * 60 * 60_000;
  const bucketSum = new Map<number, number>();

  for (let i = 0; i < topTokens.length; i++) {
    const entry = topTokens[i];
    const r = charts[i];
    if (!entry || !r || r.status !== 'fulfilled') continue;
    const [, { balance }] = entry;

    // Forward-fill всередині chart'а: запам'ятовуємо останню ціну, бо CoinGecko
    // повертає рідкі точки і пропуски бакетів призводять до 0 у сумі
    const sortedPoints = [...r.value].sort((a, b) => a.timestamp - b.timestamp);
    const perBucket = new Map<number, number>();
    for (const p of sortedPoints) {
      const bucket = Math.floor(p.timestamp / bucketSize) * bucketSize;
      perBucket.set(bucket, p.price); // overwrite — лишається остання ціна у бакеті
    }
    for (const [bucket, price] of perBucket) {
      bucketSum.set(bucket, (bucketSum.get(bucket) ?? 0) + price * balance);
    }
  }

  if (bucketSum.size === 0) {
    // Всі market_chart запити провалились (rate limit / no data) — будуємо плоский ряд
    // з поточною вартістю всього портфеля (coingecko + unknown токени)
    const knownTotal = Array.from(aggregated.values()).reduce((s, t) => s + t.usdValue, 0);
    const flatTotal = knownTotal + unknownTotal;
    if (flatTotal > 0) {
      const bs = periodDays <= 1 ? 60 * 60_000 : 24 * 60 * 60_000;
      const startMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
      for (let t = Math.ceil(startMs / bs) * bs; t <= Date.now(); t += bs) {
        bucketSum.set(t, flatTotal);
      }
    }
  } else if (unknownTotal > 0) {
    // Є coingecko-дані — додаємо unknownTotal як константний offset до кожного бакету
    for (const [bucket, val] of bucketSum) {
      bucketSum.set(bucket, val + unknownTotal);
    }
  }

  const points = Array.from(bucketSum.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, totalUsd]) => ({ timestamp, totalUsd }));

  RECONSTRUCTION_CACHE.set(cacheKey, { fetchedAt: Date.now(), points });
  return points;
}

function mergePoints(a: SnapshotPoint[], b: SnapshotPoint[]): SnapshotPoint[] {
  const merged = new Map<number, number>();
  for (const p of a) merged.set(p.timestamp, p.totalUsd);
  for (const p of b) merged.set(p.timestamp, p.totalUsd); // snapshot'и перекривають реконструкцію
  return Array.from(merged.entries())
    .sort(([x], [y]) => x - y)
    .map(([timestamp, totalUsd]) => ({ timestamp, totalUsd }));
}

export async function savePortfolioSnapshot(userId: string): Promise<void> {
  const wallets = await prisma.wallet.findMany({
    where: { userId },
    include: { balances: { where: { isSpam: false, isHidden: false }, select: { usdValue: true } } },
  });
  const totalUsd = wallets.reduce(
    (sum, w) => sum + w.balances.reduce((s, b) => s + b.usdValue, 0),
    0,
  );
  await prisma.portfolioSnapshot.create({ data: { userId, totalUsd } });
}
