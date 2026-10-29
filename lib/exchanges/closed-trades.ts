import { prisma } from "@/lib/db/prisma";
import { D } from "./decimal";
import { timestamp } from "./provider-utils";
import { settlementPrices } from "./pricing";
import type { ExchangeAdapter } from "./types";

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
const OVERLAP_MS = DAY_MS;

/** Exchanges whose own position history feeds the statistics; the worker's closes are skipped there. */
export const HISTORY_EXCHANGES = new Set(["bybit", "gate", "bingx", "kucoin"]);

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
 * `closedPnl` is already net of trading fees (as Bybit shows it); funding is not part of it.
 */
export function bybitClosedTrades(rows: Row[]): ClosedTradeRow[] {
  const sorted = [...rows].sort((a, b) => Number(a.updatedTime) - Number(b.updatedTime));
  const trades: (ClosedTradeRow & { key: string; exitValue: InstanceType<typeof D> })[] = [];
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
    const key = `${symbol}:${side}:${entry}`;
    const size = new D(dec(r.closedSize) ?? dec(r.qty) ?? "0");
    const exitValue = new D(dec(r.cumExitValue) ?? "0");
    const open = latest.get(`${symbol}:${side}`);
    if (open && open.key === key) {
      open.size = new D(open.size ?? "0").plus(size).toFixed();
      open.exitValue = open.exitValue.plus(exitValue);
      open.exitPrice = new D(open.size).isZero() ? open.exitPrice : open.exitValue.div(open.size).toFixed();
      open.pnl = new D(open.pnl).plus(pnl).toFixed();
      open.closedAt = closedAt;
      continue;
    }
    const trade = {
      key,
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
  return trades.map(({ key: _key, exitValue: _value, ...trade }) => trade);
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
    if (r.closeAllPositions !== true || !symbol || closedAt === null || pnl === null || !["long", "short"].includes(side))
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

const lastAttempt = new Map<string, number>();

/** Reads new closed trades of a connection after a successful sync; never fails the sync. */
export async function syncClosedTrades(
  connection: { id: string; userId: string; exchange: string; tradesAt: Date | null },
  adapter: ExchangeAdapter,
  now = Date.now(),
): Promise<"skipped" | "saved" | "failed"> {
  if (!adapter.closedTrades || !HISTORY_EXCHANGES.has(connection.exchange)) return "skipped";
  if (now - (lastAttempt.get(connection.id) ?? 0) < INTERVAL_MS) return "skipped";
  lastAttempt.set(connection.id, now);
  const since = connection.tradesAt
    ? connection.tradesAt.getTime() - OVERLAP_MS
    : now - HISTORY_DAYS * DAY_MS;
  try {
    const rows = await adapter.closedTrades(since, now);
    await saveClosedTrades(connection, rows, "history", true);
    await prisma.exchangeConnection.update({
      where: { id: connection.id },
      data: { tradesAt: new Date(now) },
    });
    return "saved";
  } catch {
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
