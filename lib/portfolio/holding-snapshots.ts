import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled, HYPERCORE_CHAINS } from "@/lib/exchanges/config";
import { exchangeBalanceRows } from "@/lib/exchanges/balance-rows";
import { tickerChanges } from "@/lib/market/ticker-changes";
import type { AggregatedToken } from "@/lib/services/portfolio";
import { getTokenGroupingKey } from "@/lib/utils/token-grouping";
import {
  appendHoldings,
  appendPrices,
  computeReturns,
  slotOf,
  type Holding,
  type HoldingSeries,
  type PriceSeries,
} from "./holding-returns";
import { mergeExchangeHoldings, type ExchangeHolding } from "./unified-assets";

const PRICE_SERIES_ID = "global";
/** Dust below this value is not tracked (the movers list hides positions under $1). */
const MIN_TRACKED_USD = 0.1;
/** Percentage points between our 24h return of an unchanged position and the market's 24h change. */
const MISMATCH_PP = 2;

interface UserCoins {
  holdings: Map<string, Holding>;
  /** The price the dashboard shows and when it was last updated (the freshest one goes into the shared series). */
  prices: Map<string, { price: number; at: number }>;
  /** Market 24h change of wallet coins (USD-weighted like the dashboard), for the correctness check. */
  walletChanges: Map<string, number>;
  /** Ticker of coins held only on exchanges. */
  exchangeOnly: Map<string, string>;
}

function emptyToken(key: string, symbol: string): AggregatedToken {
  return {
    key,
    symbol,
    name: symbol,
    logoUrl: null,
    coingeckoId: null,
    chainName: "",
    tokenAddress: "",
    totalBalance: 0,
    totalUsd: 0,
    share: 0,
    chains: [],
    walletIds: [],
    wallets: [],
    currentPrice: 0,
    priceChange24h: 0,
  };
}

/**
 * Loads every user's coins with three queries for all users and groups them exactly like the dashboard
 * movers do (wallet grouping key, then exchange balances merged by ticker).
 */
async function loadUserCoins(): Promise<Map<string, UserCoins>> {
  const withExchanges = process.env.EXCHANGES_ENABLED === "true";
  const [wallets, connections] = await Promise.all([
    prisma.wallet.findMany({
      where: { user: { isBlocked: false } },
      select: {
        id: true,
        userId: true,
        balances: {
          where: { isSpam: false, isHidden: false },
          select: {
            tokenSymbol: true,
            chainName: true,
            tokenAddress: true,
            coingeckoId: true,
            balance: true,
            usdValue: true,
            priceUsd: true,
            priceChange24h: true,
            updatedAt: true,
          },
        },
      },
    }),
    withExchanges
      ? prisma.exchangeConnection.findMany({
          where: { status: { not: "DISCONNECTED" }, user: { isBlocked: false } },
          select: {
            userId: true,
            exchange: true,
            walletId: true,
            hyperCoreMigratedAt: true,
            accounts: {
              select: {
                id: true,
                kind: true,
                errorCode: true,
                equityUsd: true,
                balancesAt: true,
                balances: { select: { symbol: true, total: true, usdValue: true, priceUsd: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const userConnections = connections.filter((c) => exchangesEnabled(c.userId));
  const migrated = new Set(
    userConnections.flatMap((c) => (c.hyperCoreMigratedAt && c.walletId ? [c.walletId] : [])),
  );

  const tokensByUser = new Map<string, Map<string, AggregatedToken>>();
  const priceAt = new Map<string, number>();
  const changeAcc = new Map<string, { weighted: number; weight: number }>();
  for (const w of wallets) {
    const tokens = tokensByUser.get(w.userId) ?? new Map<string, AggregatedToken>();
    tokensByUser.set(w.userId, tokens);
    for (const b of w.balances) {
      if (migrated.has(w.id) && HYPERCORE_CHAINS.includes(b.chainName)) continue;
      const key = getTokenGroupingKey(b);
      const token = tokens.get(key) ?? { ...emptyToken(key, b.tokenSymbol), coingeckoId: b.coingeckoId };
      tokens.set(key, token);
      token.totalBalance += b.balance;
      token.totalUsd += b.usdValue;
      token.coingeckoId ??= b.coingeckoId;
      const price = b.priceUsd > 0 ? b.priceUsd : b.balance > 0 && b.usdValue > 0 ? b.usdValue / b.balance : 0;
      if (token.currentPrice === 0 && price > 0) {
        token.currentPrice = price;
        priceAt.set(`${w.userId}|${key}`, b.updatedAt.getTime());
      }
      if (b.priceChange24h !== 0 && Number.isFinite(b.priceChange24h) && b.usdValue > 0) {
        const id = `${w.userId}|${key}`;
        const acc = changeAcc.get(id) ?? { weighted: 0, weight: 0 };
        changeAcc.set(id, { weighted: acc.weighted + b.priceChange24h * b.usdValue, weight: acc.weight + b.usdValue });
      }
    }
  }

  const holdingsByUser = new Map<string, ExchangeHolding[]>();
  for (const c of userConnections) {
    if (c.exchange === "hyperliquid" && !c.hyperCoreMigratedAt) continue;
    const accounts = c.accounts
      .filter((a) => !(c.exchange === "aster" && a.kind === "spot" && a.errorCode === "SPOT_UNAVAILABLE"))
      .map((a) => ({
        id: a.id,
        exchange: c.exchange,
        kind: a.kind,
        equityUsd: a.equityUsd?.toFixed() ?? null,
        balancesAt: a.balancesAt?.getTime() ?? null,
        balances: a.balances.map((b) => ({
          symbol: b.symbol,
          total: b.total.toFixed(),
          usdValue: b.usdValue?.toFixed() ?? null,
          priceUsd: b.priceUsd?.toFixed() ?? null,
        })),
      }));
    const list = holdingsByUser.get(c.userId) ?? [];
    holdingsByUser.set(c.userId, list);
    for (const row of exchangeBalanceRows(accounts)) {
      if (Number(row.total) === 0 || row.usdValue === null) continue;
      const at = row.account.balancesAt ?? 0;
      const id = `${c.userId}|exchange:${row.symbol.toUpperCase()}`;
      priceAt.set(id, Math.max(priceAt.get(id) ?? 0, at));
      list.push({
        key: `${row.account.id}:${row.symbol}`,
        symbol: row.symbol,
        label: "",
        exchange: row.account.exchange,
        kind: row.account.kind,
        amount: Number(row.total),
        usdValue: Number(row.usdValue),
        priceUsd: row.priceUsd === null ? null : Number(row.priceUsd),
      });
    }
  }

  const result = new Map<string, UserCoins>();
  for (const userId of new Set([...tokensByUser.keys(), ...holdingsByUser.keys()])) {
    const walletTokens = [...(tokensByUser.get(userId)?.values() ?? [])];
    const walletQty = new Map(walletTokens.map((t) => [t.key, t.totalBalance]));
    const coins: UserCoins = { holdings: new Map(), prices: new Map(), walletChanges: new Map(), exchangeOnly: new Map() };
    for (const row of mergeExchangeHoldings(walletTokens, holdingsByUser.get(userId) ?? [])) {
      if (row.totalUsd < MIN_TRACKED_USD || !(row.currentPrice > 0)) continue;
      const exchange = row.exchanges.reduce((s, h) => s + h.amount, 0);
      coins.holdings.set(row.key, { wallet: walletQty.get(row.key) ?? 0, exchange });
      coins.prices.set(row.key, { price: row.currentPrice, at: priceAt.get(`${userId}|${row.key}`) ?? 0 });
      const acc = changeAcc.get(`${userId}|${row.key}`);
      if (acc && acc.weight > 0) coins.walletChanges.set(row.key, acc.weighted / acc.weight);
      if (row.exchangeOnly) coins.exchangeOnly.set(row.key, row.symbol.toUpperCase());
    }
    result.set(userId, coins);
  }
  return result;
}

const asPriceSeries = (data: unknown): PriceSeries | null =>
  data && typeof data === "object" && (data as PriceSeries).v === 1 ? (data as PriceSeries) : null;
const asHoldingSeries = (data: unknown): HoldingSeries | null =>
  data && typeof data === "object" && (data as HoldingSeries).v === 1 ? (data as HoldingSeries) : null;

export interface HoldingSnapshotStats {
  users: number;
  coins: number;
  steady: number;
  mismatches: number;
}

/**
 * Writes the 30-minute snapshot of every user's coins and their 24h result. The number of queries does
 * not grow with users or coins: bulk reads of balances and series, then one batched write.
 */
export async function recordHoldingSnapshots(now = Date.now()): Promise<HoldingSnapshotStats> {
  const slot = slotOf(now);
  const [coinsByUser, stored, priceRow] = await Promise.all([
    loadUserCoins(),
    prisma.tokenHoldingSeries.findMany({ select: { userId: true, data: true } }),
    prisma.tokenPriceSeries.findUnique({ where: { id: PRICE_SERIES_ID }, select: { data: true } }),
  ]);
  const storedByUser = new Map(stored.map((r) => [r.userId, asHoldingSeries(r.data)]));

  const holdings = new Map<string, HoldingSeries>();
  const freshest = new Map<string, { price: number; at: number }>();
  for (const userId of new Set([...coinsByUser.keys(), ...storedByUser.keys()])) {
    const coins = coinsByUser.get(userId);
    const previous = storedByUser.get(userId) ?? null;
    if (!coins?.holdings.size && !previous) continue;
    const next = appendHoldings(previous, slot, coins?.holdings ?? new Map());
    holdings.set(userId, next);
    for (const [key, p] of coins?.prices ?? []) {
      if ((freshest.get(key)?.at ?? -1) < p.at) freshest.set(key, p);
    }
  }
  const allPrices = new Map([...freshest].map(([key, p]) => [key, p.price]));
  const keep = new Set([...holdings.values()].flatMap((h) => Object.keys(h.q)));
  const prices = appendPrices(asPriceSeries(priceRow?.data), slot, allPrices, keep);

  const rows: { userId: string; data: HoldingSeries; result: unknown }[] = [];
  const checks: { key: string; ours: number; ref: number | undefined; ticker?: string }[] = [];
  for (const [userId, series] of holdings) {
    const coins = coinsByUser.get(userId);
    const own = new Map([...(coins?.prices ?? [])].map(([key, p]) => [key, p.price]));
    const { result, steady } = computeReturns(prices, series, own);
    rows.push({ userId, data: series, result });
    for (const [key, ours] of steady) {
      const ticker = coins?.exchangeOnly.get(key);
      checks.push({ key, ours, ref: ticker ? undefined : coins?.walletChanges.get(key), ticker });
    }
  }

  if (checks.some((c) => c.ticker)) {
    try {
      const tickers = await tickerChanges();
      for (const c of checks) if (c.ticker) c.ref = tickers.get(c.ticker);
    } catch (err) {
      console.warn("[holdings] ticker changes unavailable:", err);
    }
  }
  const mismatches = checks.filter((c) => c.ref !== undefined && Math.abs(c.ours - c.ref) > MISMATCH_PP);
  if (mismatches.length) {
    console.warn(
      `[holdings] ${mismatches.length}/${checks.length} unchanged positions differ from the market 24h change:`,
      mismatches
        .slice(0, 5)
        .map((c) => `${c.key} ours ${c.ours.toFixed(2)}% vs ${c.ref!.toFixed(2)}%`)
        .join("; "),
    );
  }

  if (rows.length) {
    await prisma.$transaction([
      prisma.tokenPriceSeries.upsert({
        where: { id: PRICE_SERIES_ID },
        create: { id: PRICE_SERIES_ID, data: prices as unknown as Prisma.InputJsonValue },
        update: { data: prices as unknown as Prisma.InputJsonValue },
      }),
      prisma.$executeRaw`
        INSERT INTO "TokenHoldingSeries" ("userId", "data", "result", "updatedAt")
        SELECT r."userId", r."data", r."result", NOW()
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r("userId" text, "data" jsonb, "result" jsonb)
        WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = r."userId")
        ON CONFLICT ("userId") DO UPDATE
        SET "data" = EXCLUDED."data", "result" = EXCLUDED."result", "updatedAt" = NOW()`,
    ]);
  }
  return {
    users: rows.length,
    coins: Object.keys(prices.p).length,
    steady: checks.length,
    mismatches: mismatches.length,
  };
}
