import { prisma } from "@/lib/db/prisma";
import { D } from "./decimal";
import { timestamp } from "./provider-utils";
import { settlementPrices } from "./pricing";
import { errorDiagnostics, safeError, type ExchangeAdapter } from "./types";

/**
 * Closed futures positions for trading statistics (docs/TRADING_STATS.md). One row is one position
 * from opening to full close; partial closes add up into it. Exchanges with a position history
 * (Bybit, Gate, BingX, KuCoin) are read from it, a month back the first time and then every 30
 * minutes; the others get the closes the worker sees (lib/positions/alert-service.ts).
 */
export interface ClosedTradeRow {
  externalId: string;
  symbol: string;
  base: string;
  settle: string;
  side: "long" | "short";
  size: string | null;
  entryPrice: string | null;
  exitPrice: string | null;
  openedAt: number | null;
  closedAt: number;
  /** Net result in the settle currency: price PnL, fees and funding as the exchange reports it. */
  pnl: string;
}

type Row = Record<string, unknown>;

export const HISTORY_DAYS = 30;
const DAY_MS = 86_400_000;
const INTERVAL_MS = 30 * 60_000;
/** Re-read a week: a position closed in parts over days must be read whole to stay one trade. */
const OVERLAP_MS = 7 * DAY_MS;

/** Exchanges whose own position history feeds the statistics; the worker's closes are skipped there. */
export const HISTORY_EXCHANGES = new Set(["bybit", "gate", "kucoin"]);
/**
 * Exchanges whose closes the worker records itself, with the history read only for the past: trades
 * closed before the moment the worker started recording them (no duplicates). BingX: its position
 * history came back empty for a real account while the income ledger (exact close results) works.
 */
export const BACKFILL_UNTIL: Record<string, number> = {
  bingx: Date.UTC(2026, 9, 29, 16, 44),
  // The worker has recorded Binance and Aster closes since the statistics release.
  binance: Date.UTC(2026, 9, 29, 14, 56),
  aster: Date.UTC(2026, 9, 29, 14, 56),
};

const str = (value: unknown) =>
  typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
const dec = (value: unknown) => {
  const text = str(value);
  return text && Number.isFinite(Number(text)) ? new D(text).toFixed() : null;
};

/** "BTCUSDT" → BTC/USDT, "BTCPERP" → BTC/USDC (Bybit's USDC perpetuals). */
export function splitLinearSymbol(symbol: string): { base: string; settle: string } {
  for (const [suffix, settle] of [["USDT", "USDT"], ["USDC", "USDC"], ["PERP", "USDC"]] as const)
    if (symbol.endsWith(suffix) && symbol.length > suffix.length)
      return { base: symbol.slice(0, -suffix.length), settle };
  return { base: symbol, settle: "USDT" };
}

/**
 * Bybit `closed-pnl` has one row per closing order and no position id: rows of one symbol and side
 * with the same entry price follow each other until the position is gone, so they are one trade.
 * The reported entry may differ in the last digits between partial closes, hence the tolerance.
 * `closedPnl` is already net of trading fees (as Bybit shows it); funding is not part of it.
 */
const SAME_ENTRY = 0.001;
const sameEntry = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Math.abs(Number(a) / Number(b) - 1) <= SAME_ENTRY);
export function bybitClosedTrades(rows: Row[]): ClosedTradeRow[] {
  const sorted = [...rows].sort((a, b) => Number(a.updatedTime) - Number(b.updatedTime));
  const trades: (ClosedTradeRow & { exitValue: InstanceType<typeof D> })[] = [];
  /** The latest trade of each symbol and side: a partial close continues it while the entry matches. */
  const latest = new Map<string, (typeof trades)[number]>();
  for (const r of sorted) {
    const symbol = str(r.symbol);
    const closedAt = timestamp(r.updatedTime) ?? timestamp(r.createdTime);
    const pnl = dec(r.closedPnl);
    if (!symbol || closedAt === null || pnl === null) continue;
    // The closing order sells a long and buys back a short.
    const side: "long" | "short" = str(r.side) === "Sell" ? "long" : "short";
    const entry = dec(r.avgEntryPrice);
    const size = new D(dec(r.closedSize) ?? dec(r.qty) ?? "0");
    const exitValue = new D(dec(r.cumExitValue) ?? "0");
    const open = latest.get(`${symbol}:${side}`);
    if (open && sameEntry(open.entryPrice, entry)) {
      open.size = new D(open.size ?? "0").plus(size).toFixed();
      open.exitValue = open.exitValue.plus(exitValue);
      open.exitPrice = new D(open.size).isZero() ? open.exitPrice : open.exitValue.div(open.size).toFixed();
      open.pnl = new D(open.pnl).plus(pnl).toFixed();
      open.closedAt = closedAt;
      continue;
    }
    const trade = {
      exitValue,
      externalId: `bybit:${str(r.orderId)}`,
      symbol,
      ...splitLinearSymbol(symbol),
      side,
      size: size.toFixed(),
      entryPrice: entry,
      exitPrice: dec(r.avgExitPrice),
      openedAt: null,
      closedAt,
      pnl,
    };
    trades.push(trade);
    latest.set(`${symbol}:${side}`, trade);
  }
  return trades.map(({ exitValue: _value, ...trade }) => trade);
}

/** Gate `position_close`: one row per closed position; `pnl` = price PnL + fees + funding. */
export function gateClosedTrades(rows: Row[], multipliers: Map<string, string>): ClosedTradeRow[] {
  return rows.flatMap((r) => {
    const contract = str(r.contract);
    const closedAt = timestamp(r.time, 1000);
    const pnl = dec(r.pnl);
    const side = str(r.side);
    if (!contract.endsWith("_USDT") || closedAt === null || pnl === null || !["long", "short"].includes(side))
      return [];
    const contracts = dec(r.accum_size);
    const multiplier = multipliers.get(contract);
    // Gate names prices by direction: a long buys at long_price and sells at short_price.
    const entry = dec(side === "long" ? r.long_price : r.short_price);
    const exit = dec(side === "long" ? r.short_price : r.long_price);
    return [{
      externalId: `gate:${contract}:${side}:${closedAt}`,
      symbol: contract,
      base: contract.slice(0, -5),
      settle: "USDT",
      side: side as "long" | "short",
      size: contracts && multiplier ? new D(contracts).abs().mul(multiplier).toFixed() : null,
      entryPrice: entry,
      exitPrice: exit,
      openedAt: timestamp(r.first_open_time, 1000),
      closedAt,
      pnl,
    }];
  });
}

/** BingX `positionHistory`: one row per position; only fully closed ones count. */
export function bingxClosedTrades(rows: Row[]): ClosedTradeRow[] {
  return rows.flatMap((r) => {
    const symbol = str(r.symbol);
    const closedAt = timestamp(r.updateTime);
    const pnl = dec(r.netProfit);
    const side = str(r.positionSide).toLowerCase();
    const closed = r.closeAllPositions === true || r.closeAllPositions === "true";
    if (!closed || !symbol || closedAt === null || pnl === null || !["long", "short"].includes(side))
      return [];
    const [base, settle] = symbol.split("-");
    return [{
      externalId: `bingx:${str(r.positionId)}`,
      symbol,
      base: base ?? symbol,
      settle: settle || "USDT",
      side: side as "long" | "short",
      size: dec(r.closePositionAmt) ?? dec(r.positionAmt),
      entryPrice: dec(r.avgPrice),
      exitPrice: dec(r.avgClosePrice),
      openedAt: timestamp(r.openTime),
      closedAt,
      pnl,
    }];
  });
}

/** One executed order or trade fill, as the position rebuild needs it. */
export interface Fill {
  id: string;
  symbol: string;
  buy: boolean;
  /** "LONG" / "SHORT" in hedge mode, "BOTH" in one-way mode. */
  positionSide: string;
  qty: number;
  price: number;
  /** Realized PnL booked by this fill (closing fills), settle currency. */
  realizedPnl: number;
  /** Trading fee paid, settle currency, positive. */
  fee: number;
  at: number;
}

/**
 * Positions rebuilt from executed orders or fills where an exchange has no position history:
 * opening fills add to a position, closing fills reduce it, and when it is back at zero the trade is
 * complete. Result = realized PnL of the closing fills minus every fee of the cycle; funding is not
 * part of it. A close of a position opened before the read range has no known entry and is skipped.
 */
export function tradesFromFills(
  fills: Fill[],
  prefix: string,
  split: (symbol: string) => { base: string; settle: string },
): ClosedTradeRow[] {
  type Cycle = {
    side: "long" | "short";
    qty: number;
    opened: number;
    entryValue: number;
    closed: number;
    exitValue: number;
    profit: number;
    fees: number;
    openedAt: number;
    firstId: string;
  };
  const sorted = fills.filter((f) => f.qty > 0 && f.price > 0 && f.symbol).sort((a, b) => a.at - b.at);
  const open = new Map<string, Cycle>();
  const trades: ClosedTradeRow[] = [];
  for (const f of sorted) {
    const positionSide = f.positionSide.toUpperCase();
    const key = `${f.symbol}:${positionSide === "LONG" || positionSide === "SHORT" ? positionSide : "BOTH"}`;
    let cycle = open.get(key);
    // Hedge mode names the side; one-way mode opens with whatever side the flat position takes.
    const side: "long" | "short" =
      positionSide === "LONG" ? "long" : positionSide === "SHORT" ? "short" : (cycle?.side ?? (f.buy ? "long" : "short"));
    if ((side === "long") === f.buy) {
      cycle ??= { side, qty: 0, opened: 0, entryValue: 0, closed: 0, exitValue: 0, profit: 0, fees: 0, openedAt: f.at, firstId: f.id };
      cycle.qty += f.qty;
      cycle.opened += f.qty;
      cycle.entryValue += f.qty * f.price;
      cycle.fees += f.fee;
      open.set(key, cycle);
      continue;
    }
    if (!cycle) continue;
    const closing = Math.min(f.qty, cycle.qty);
    cycle.qty -= closing;
    cycle.closed += closing;
    cycle.exitValue += closing * f.price;
    cycle.profit += f.realizedPnl;
    cycle.fees += f.fee;
    if (cycle.qty > cycle.opened * 1e-9) continue;
    open.delete(key);
    trades.push({
      externalId: `${prefix}:${cycle.firstId}`,
      symbol: f.symbol,
      ...split(f.symbol),
      side: cycle.side,
      size: new D(cycle.closed.toPrecision(15)).toFixed(),
      entryPrice: new D((cycle.entryValue / cycle.opened).toPrecision(12)).toFixed(),
      exitPrice: new D((cycle.exitValue / cycle.closed).toPrecision(12)).toFixed(),
      openedAt: cycle.openedAt,
      closedAt: f.at,
      pnl: new D((cycle.profit - cycle.fees).toFixed(8)).toFixed(),
    });
  }
  return trades;
}

const bingxSplit = (symbol: string) => {
  const [base, settle] = symbol.split("-");
  return { base: base ?? symbol, settle: settle || "USDT" };
};

/** BingX order history (`trade/allOrders`) when its position history comes back empty. */
export function bingxTradesFromOrders(orders: Row[]): ClosedTradeRow[] {
  return tradesFromFills(
    orders.flatMap((r) => {
      const at = timestamp(r.updateTime) ?? timestamp(r.time);
      return at === null
        ? []
        : [{
            id: str(r.orderId),
            symbol: str(r.symbol),
            buy: str(r.side).toUpperCase() === "BUY",
            positionSide: str(r.positionSide),
            qty: Number(r.executedQty),
            price: Number(r.avgPrice),
            realizedPnl: Number(r.profit) || 0,
            fee: Math.abs(Number(r.commission) || 0),
            at,
          }];
    }),
    "bingx:order",
    bingxSplit,
  );
}

/**
 * Binance and Aster (`userTrades`): fills carry `realizedPnl` and a fee in `commissionAsset`; a fee
 * in another coin (BNB) is valued with `rates`.
 */
export function binanceTradesFromFills(rows: Row[], prefix: string, rates: Map<string, string>): ClosedTradeRow[] {
  return tradesFromFills(
    rows.flatMap((r) => {
      const at = timestamp(r.time);
      if (at === null) return [];
      const symbol = str(r.symbol);
      const asset = str(r.commissionAsset).toUpperCase();
      const settle = splitLinearSymbol(symbol).settle;
      const rate = asset === settle || asset === "USDT" || asset === "USDC" ? 1 : Number(rates.get(asset) ?? 0);
      return [{
        id: str(r.orderId) || str(r.id),
        symbol,
        buy: str(r.side).toUpperCase() === "BUY",
        positionSide: str(r.positionSide) || "BOTH",
        qty: Number(r.qty),
        price: Number(r.price),
        realizedPnl: Number(r.realizedPnl) || 0,
        fee: Math.abs(Number(r.commission) || 0) * rate,
        at,
      }];
    }),
    prefix,
    splitLinearSymbol,
  );
}

/**
 * Reads a month of fills for the coins the income ledger shows realized PnL on, a week per query
 * (both exchanges limit `userTrades` to seven days); a full page is split until it fits.
 */
export async function readFillHistory(
  income: (startTime: number, endTime: number) => Promise<Row[]>,
  fills: (symbol: string, startTime: number, endTime: number) => Promise<Row[]>,
  since: number,
  until: number,
  limit = 1000,
): Promise<{ symbols: number; rows: Row[] }> {
  const WEEK = 7 * DAY_MS;
  const pages = async (read: (a: number, b: number) => Promise<Row[]>, a: number, b: number, depth = 0): Promise<Row[]> => {
    const rows = await read(a, b);
    if (rows.length < limit || b - a < 60_000 || depth > 8) return rows;
    const mid = Math.floor((a + b) / 2);
    return [...(await pages(read, a, mid, depth + 1)), ...(await pages(read, mid + 1, b, depth + 1))];
  };
  const symbols = new Set<string>();
  for (let start = since; start < until; start += WEEK)
    for (const r of await pages(income, start, Math.min(until, start + WEEK - 1)))
      if (typeof r.symbol === "string" && r.symbol) symbols.add(r.symbol);
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const symbol of symbols)
    for (let start = since; start < until; start += WEEK)
      for (const r of await pages((a, b) => fills(symbol, a, b), start, Math.min(until, start + WEEK - 1))) {
        const id = `${str(r.symbol)}:${str(r.id)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push(r);
      }
  return { symbols: symbols.size, rows };
}

const lastAttempt = new Map<string, number>();
/**
 * History read before this moment was grouped by an older rule: such connections read the whole
 * month again once, and the stale pieces of the window are replaced.
 */
const HISTORY_RULES_SINCE = Date.UTC(2026, 9, 29, 18, 45);

/** Reads new closed trades of a connection after a successful sync; never fails the sync. */
export async function syncClosedTrades(
  connection: { id: string; userId: string; exchange: string; tradesAt: Date | null },
  adapter: ExchangeAdapter,
  now = Date.now(),
  /** A close was just seen: read now instead of waiting for the 30-minute interval. */
  force = false,
): Promise<"skipped" | "saved" | "failed"> {
  const backfillUntil = BACKFILL_UNTIL[connection.exchange];
  if (!adapter.closedTrades || (!HISTORY_EXCHANGES.has(connection.exchange) && backfillUntil === undefined))
    return "skipped";
  if (!force && now - (lastAttempt.get(connection.id) ?? 0) < INTERVAL_MS) return "skipped";
  lastAttempt.set(connection.id, now);
  const fresh = !connection.tradesAt || connection.tradesAt.getTime() < HISTORY_RULES_SINCE;
  const since = fresh ? now - HISTORY_DAYS * DAY_MS : connection.tradesAt!.getTime() - OVERLAP_MS;
  try {
    const rows = (await adapter.closedTrades(since, now)).filter(
      (r) => backfillUntil === undefined || r.closedAt < backfillUntil,
    );
    await saveClosedTrades(connection, rows, "history", true);
    // A full month read is the truth for its window: rows it no longer lists (pieces of a trade now
    // grouped as one) go away. Only then, and only trades that lie wholly inside the window: a weekly
    // read cannot rebuild a position opened before its start and would drop it otherwise.
    if (fresh)
      await prisma.closedTrade.deleteMany({
        where: {
          connectionId: connection.id,
          source: "history",
          closedAt: { gte: new Date(since), ...(backfillUntil !== undefined ? { lt: new Date(backfillUntil) } : {}) },
          OR: [{ openedAt: null }, { openedAt: { gte: new Date(since) } }],
          externalId: { notIn: rows.map((r) => r.externalId) },
        },
      });
    await prisma.exchangeConnection.update({
      where: { id: connection.id },
      data: { tradesAt: new Date(now) },
    });
    if (fresh || rows.length)
      console.log(
        `[closed-trades] ${connection.exchange}: ${rows.length} trade(s) since ${new Date(since).toISOString().slice(0, 10)}`,
      );
    return "saved";
  } catch (error) {
    console.warn(
      `[closed-trades] ${connection.exchange} history failed: ${safeError(error)} (${errorDiagnostics(error)})`,
    );
    return "failed";
  }
}

/** Stores trades once per (connection, externalId); a re-read refreshes the figures. */
export async function saveClosedTrades(
  connection: { id: string; userId: string },
  rows: ClosedTradeRow[],
  source: "history" | "watch",
  exact: boolean,
  pnlUsd?: (row: ClosedTradeRow) => number | null,
) {
  if (!rows.length) return;
  const rates = await settlementPrices().catch(() => new Map<string, string>());
  for (const row of rows) {
    const rate = Number(rates.get(row.settle) ?? (["USDT", "USDC"].includes(row.settle) ? "1" : NaN));
    const usd = pnlUsd?.(row) ?? (Number.isFinite(rate) ? Number(row.pnl) * rate : null);
    if (usd === null || !Number.isFinite(usd)) continue;
    const data = {
      symbol: row.symbol,
      base: row.base,
      settle: row.settle,
      side: row.side,
      size: row.size,
      entryPrice: row.entryPrice,
      exitPrice: row.exitPrice,
      openedAt: row.openedAt === null ? null : new Date(row.openedAt),
      closedAt: new Date(row.closedAt),
      pnl: row.pnl,
      pnlUsd: new D(usd).toFixed(),
      exact,
      source,
    };
    await prisma.closedTrade.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: row.externalId } },
      create: { userId: connection.userId, connectionId: connection.id, externalId: row.externalId, ...data },
      update: data,
    });
  }
}
