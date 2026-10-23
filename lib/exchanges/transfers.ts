import { decimal, requiredDecimal } from "./decimal";
import { record, records } from "./adapters";
import { okxRows } from "./provider-utils";
import { ExchangeError } from "./types";
import type { Request } from "./transport";

/**
 * Deposit and withdrawal history read with the same read-only keys as balances. Each exchange
 * limits how far back one request may look, so the range since `since` is walked in windows.
 */
export interface Transfer {
  direction: "deposit" | "withdrawal";
  asset: string;
  network: string | null;
  amount: string;
  fee: string | null;
  address: string | null;
  txHash: string | null;
  status: "pending" | "completed" | "failed";
  externalId: string;
  occurredAt: Date;
}

type Row = Record<string, unknown>;
const DAY = 86_400_000;

function text(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function required(value: unknown): string {
  const result = text(value);
  if (result === null) throw new ExchangeError("INVALID_RESPONSE");
  return result;
}
function time(value: unknown): Date {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  // Binance withdrawals use "2019-10-12 11:12:02" in UTC; everything else is epoch s or ms.
  const iso = typeof n === "number" ? "" : required(n).replace(" ", "T");
  const date =
    typeof n === "number"
      ? new Date(n < 1e12 ? n * 1000 : n)
      : new Date(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) throw new ExchangeError("INVALID_RESPONSE");
  return date;
}
/** A withdrawal fee may be reported but zero; keep it as a value only when present. */
function fee(value: unknown): string | null {
  return decimal(value);
}
/** Inclusive windows of at most `span` ms covering [since, now]. */
export function windows(since: number, now: number, span: number): [number, number][] {
  const result: [number, number][] = [];
  for (let start = since; start < now; start += span)
    result.push([start, Math.min(start + span - 1, now)]);
  return result;
}

// ── Binance: /sapi/v1/capital/{deposit/hisrec, withdraw/history}, 90-day windows ──
const BINANCE_DEPOSIT: Record<string, Transfer["status"]> = {
  "0": "pending", "6": "completed", "7": "failed", "8": "pending", "1": "completed", "2": "failed",
};
const BINANCE_WITHDRAWAL: Record<string, Transfer["status"]> = {
  "0": "pending", "1": "failed", "2": "pending", "3": "failed", "4": "pending", "5": "failed", "6": "completed",
};
export async function binanceTransfers(request: Request, since: number, now = Date.now()) {
  const result: Transfer[] = [];
  for (const [startTime, endTime] of windows(since, now, 90 * DAY)) {
    for (const row of records(
      await request("capital/deposit/hisrec", "sapi", { startTime, endTime, limit: 1000 }, 1),
    ) as Row[])
      result.push({
        direction: "deposit",
        asset: required(row.coin),
        network: text(row.network),
        amount: requiredDecimal(row.amount),
        fee: null,
        address: text(row.address),
        txHash: text(row.txId),
        status: BINANCE_DEPOSIT[String(row.status)] ?? "pending",
        externalId: required(row.id ?? row.txId),
        occurredAt: time(row.insertTime),
      });
    for (const row of records(
      await request("capital/withdraw/history", "sapi", { startTime, endTime, limit: 1000 }, 1),
    ) as Row[])
      result.push({
        direction: "withdrawal",
        asset: required(row.coin),
        network: text(row.network),
        amount: requiredDecimal(row.amount),
        fee: fee(row.transactionFee),
        address: text(row.address),
        txHash: text(row.txId),
        status: BINANCE_WITHDRAWAL[String(row.status)] ?? "pending",
        externalId: required(row.id),
        occurredAt: time(row.applyTime),
      });
  }
  return result;
}

// ── Bybit: /v5/asset/{deposit,withdraw}/query-record, 30-day windows with cursors ──
function bybitResult(value: unknown): Row {
  const response = record(value);
  if (response.retCode !== 0) throw new ExchangeError("UNAVAILABLE");
  return record(response.result);
}
async function bybitPages(request: Request, path: string, params: Row): Promise<Row[]> {
  const all: Row[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const result = bybitResult(await request(path, "private", { ...params, limit: 50, ...(cursor ? { cursor } : {}) }));
    all.push(...(records(result.rows) as Row[]));
    cursor = typeof result.nextPageCursor === "string" ? result.nextPageCursor : "";
    if (!cursor) return all;
  }
  throw new ExchangeError("INVALID_RESPONSE");
}
const BYBIT_DEPOSIT: Record<string, Transfer["status"]> = {
  "0": "pending", "1": "pending", "2": "pending", "3": "completed", "4": "failed",
  "10011": "pending", "10012": "failed",
};
const BYBIT_WITHDRAWAL: Record<string, Transfer["status"]> = {
  success: "completed", BlockchainConfirmed: "completed", CancelByUser: "failed", Reject: "failed",
  Fail: "failed", MoreInformationRequired: "pending", SecurityCheck: "pending", Pending: "pending",
};
export async function bybitTransfers(request: Request, since: number, now = Date.now()) {
  const result: Transfer[] = [];
  for (const [startTime, endTime] of windows(since, now, 30 * DAY)) {
    for (const row of await bybitPages(request, "v5/asset/deposit/query-record", { startTime, endTime }))
      result.push({
        direction: "deposit",
        asset: required(row.coin),
        network: text(row.chain),
        amount: requiredDecimal(row.amount),
        fee: fee(row.depositFee),
        address: text(row.toAddress),
        txHash: text(row.txID),
        status: BYBIT_DEPOSIT[String(row.status)] ?? "pending",
        externalId: required(row.id ?? row.txID),
        occurredAt: time(row.successAt),
      });
    for (const row of await bybitPages(request, "v5/asset/withdraw/query-record", { startTime, endTime, withdrawType: 2 }))
      result.push({
        direction: "withdrawal",
        asset: required(row.coin),
        network: text(row.chain),
        amount: requiredDecimal(row.amount),
        fee: fee(row.withdrawFee),
        address: text(row.toAddress),
        txHash: text(row.txID),
        status: BYBIT_WITHDRAWAL[String(row.status)] ?? "pending",
        externalId: required(row.withdrawId),
        occurredAt: time(row.createTime),
      });
  }
  return result;
}

// ── OKX: /api/v5/asset/{deposit,withdrawal}-history, newest first, paged backwards with `after` ──
const OKX_DEPOSIT: Record<string, Transfer["status"]> = {
  "0": "pending", "1": "completed", "2": "completed", "8": "pending", "11": "pending", "12": "pending",
  "13": "pending", "14": "pending", "17": "pending",
};
const OKX_WITHDRAWAL: Record<string, Transfer["status"]> = {
  "-3": "pending", "-2": "failed", "-1": "failed", "0": "pending", "1": "pending", "2": "completed",
  "10": "pending", "4": "pending", "5": "pending", "6": "pending", "7": "pending", "8": "pending",
  "9": "pending", "12": "pending", "15": "pending", "16": "pending", "17": "pending",
};
async function okxPages(request: Request, path: string, since: number): Promise<Row[]> {
  const all: Row[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const rows = okxRows(await request(path, "private", { limit: 100, ...(after ? { after } : {}) })) as Row[];
    const fresh = rows.filter((row) => Number(row.ts) >= since);
    all.push(...fresh);
    if (rows.length < 100 || fresh.length < rows.length) return all;
    after = required(rows.at(-1)!.ts);
  }
  return all;
}
export async function okxTransfers(request: Request, since: number) {
  const result: Transfer[] = [];
  for (const row of await okxPages(request, "asset/deposit-history", since))
    result.push({
      direction: "deposit",
      asset: required(row.ccy),
      network: text(row.chain),
      amount: requiredDecimal(row.amt),
      fee: null,
      address: text(row.to),
      txHash: text(row.txId),
      status: OKX_DEPOSIT[String(row.state)] ?? "pending",
      externalId: required(row.depId),
      occurredAt: time(row.ts),
    });
  for (const row of await okxPages(request, "asset/withdrawal-history", since))
    result.push({
      direction: "withdrawal",
      asset: required(row.ccy),
      network: text(row.chain),
      amount: requiredDecimal(row.amt),
      fee: fee(row.fee),
      address: text(row.to),
      txHash: text(row.txId),
      status: OKX_WITHDRAWAL[String(row.state)] ?? "pending",
      externalId: required(row.wdId),
      occurredAt: time(row.ts),
    });
  return result;
}

// ── Gate: /api/v4/wallet/{deposits,withdrawals}, 30-day windows in seconds ──
const GATE_STATUS: Record<string, Transfer["status"]> = {
  DONE: "completed", CANCEL: "failed", FAIL: "failed", INVALID: "failed", BCODE: "completed",
};
export async function gateTransfers(request: Request, since: number, now = Date.now()) {
  const result: Transfer[] = [];
  for (const [start, end] of windows(since, now, 30 * DAY)) {
    const params = { from: Math.floor(start / 1000), to: Math.floor(end / 1000), limit: 500 };
    for (const [direction, path] of [
      ["deposit", "deposits"],
      ["withdrawal", "withdrawals"],
    ] as const)
      for (const row of records(await request(path, "private:wallet", params)) as Row[])
        result.push({
          direction,
          asset: required(row.currency),
          network: text(row.chain),
          amount: requiredDecimal(row.amount),
          fee: direction === "withdrawal" ? fee(row.fee) : null,
          address: text(row.address),
          txHash: text(row.txid),
          status: GATE_STATUS[String(row.status)] ?? "pending",
          externalId: required(row.id),
          occurredAt: time(row.timestamp),
        });
  }
  return result;
}

// ── Hyperliquid: public ledger by address (bridge deposits and withdrawals of USDC) ──
export async function hyperliquidTransfers(
  info: (body: Record<string, unknown>) => Promise<unknown>,
  address: string,
  since: number,
) {
  const result: Transfer[] = [];
  const rows = await info({ type: "userNonFundingLedgerUpdates", user: address, startTime: since });
  if (!Array.isArray(rows)) throw new ExchangeError("INVALID_RESPONSE");
  for (const row of rows as Row[]) {
    const delta = record(row.delta);
    if (delta.type !== "deposit" && delta.type !== "withdraw") continue;
    const hash = text(row.hash);
    result.push({
      direction: delta.type === "deposit" ? "deposit" : "withdrawal",
      asset: "USDC",
      network: "Arbitrum",
      amount: requiredDecimal(delta.usdc),
      fee: delta.type === "withdraw" ? fee(delta.fee) : null,
      address: null,
      txHash: hash,
      status: "completed",
      externalId: required(hash ?? `${row.time}:${delta.type}`),
      occurredAt: time(row.time),
    });
  }
  return result;
}
