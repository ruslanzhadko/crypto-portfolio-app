import { D } from "./decimal";
import { timestamp } from "./provider-utils";

/**
 * Exact result of a fully closed position from the exchange's own money ledger: the sum of every
 * realized PnL, funding and fee entry of the symbol since the cycle opened. Null means "not yet or
 * not attributable" and the caller keeps its estimate; nothing here ever guesses.
 */
export type ClosedInput = {
  symbol: string;
  base: string;
  settle: string;
  positionKey: string;
  /** Cycle start reported by the exchange history while the position was open. */
  since: number;
  /** Last poll that still saw the position: the closing trade must come after it. */
  lastSeenAt: number;
  /** Another leg of the same symbol was open: symbol-level entries cannot be split. */
  otherLeg: boolean;
};

type Row = Record<string, unknown>;
/** Reads one ledger page of the symbol between two moments (inclusive). */
export type LedgerPage = (startTime: number, endTime: number) => Promise<Row[]>;

const WEEK = 7 * 86400_000;
/** Exchange clocks and ledger timestamps may run a little behind the poll that last saw the position. */
const CLOCK_SKEW_MS = 5_000;
const PAGE_LIMIT = 1000;

/** Income-style ledgers (Binance, Aster API, BingX): one signed `income` per entry. */
const INCOME_TYPES = new Set([
  "REALIZED_PNL",
  "FUNDING_FEE",
  "COMMISSION",
  "TRADING_FEE",
  "INSURANCE_CLEAR",
]);

async function weeks(input: ClosedInput, now: number, read: LedgerPage) {
  const all: Row[] = [];
  for (let start = input.since; start <= now; start += WEEK) {
    const batch = await read(start, Math.min(now, start + WEEK - 1));
    // A full page may hide more entries: an incomplete ledger never becomes a total.
    if (batch.length >= PAGE_LIMIT) return null;
    all.push(...batch);
  }
  return all;
}

export async function incomeLedgerResult(
  input: ClosedInput,
  read: LedgerPage,
  now = Date.now(),
): Promise<string | null> {
  if (input.otherLeg) return null;
  const rows = await weeks(input, now, read);
  if (!rows) return null;
  let total = new D(0),
    closed = false;
  const seen = new Set<string>();
  for (const r of rows) {
    const type = String(r.incomeType);
    if (!INCOME_TYPES.has(type) || r.symbol !== input.symbol) continue;
    const at = timestamp(r.time);
    if (at === null || at < input.since) continue;
    const id = `${type}:${String(r.tranId ?? r.tradeId ?? at)}:${String(r.income)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const amount = new D(String(r.income ?? "0"));
    // A fee or PnL in another asset (BNB, ASTER) cannot be added to a settle-currency total.
    if (!amount.isZero() && r.asset !== input.settle) return null;
    total = total.plus(amount);
    if (type === "REALIZED_PNL" && at >= input.lastSeenAt - CLOCK_SKEW_MS)
      closed = true;
  }
  return closed ? total.toFixed() : null;
}

/** Bybit transaction log: `change` is the wallet change of each trade and funding settlement. */
export async function bybitLedgerResult(
  input: ClosedInput,
  read: LedgerPage,
  now = Date.now(),
): Promise<string | null> {
  // One-way positions only: hedge legs share the symbol's ledger.
  if (input.otherLeg || !input.positionKey.endsWith(":0")) return null;
  const rows = await weeks(input, now, read);
  if (!rows) return null;
  let total = new D(0),
    closed = false;
  for (const r of rows) {
    if (
      r.symbol !== input.symbol ||
      !["TRADE", "SETTLEMENT"].includes(String(r.type))
    )
      continue;
    if (r.currency !== input.settle) return null;
    if (r.transSubType === "movePosition") return null;
    const at = timestamp(r.transactionTime);
    if (at === null || at < input.since) continue;
    total = total.plus(String(r.change ?? "0"));
    if (r.type === "TRADE" && at >= input.lastSeenAt - CLOCK_SKEW_MS)
      closed = true;
  }
  return closed ? total.toFixed() : null;
}
