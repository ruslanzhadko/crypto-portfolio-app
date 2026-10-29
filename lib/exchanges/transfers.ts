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

// ── Aster: POST /fapi/v3/aster/deposit-withdraw-history, the whole history in one answer ──
const ASTER_CHAINS: Record<string, string> = {
  "1": "ETH", "56": "BSC", "42161": "Arbitrum", "101": "Solana", "534352": "Scroll",
};
const ASTER_STATUS: Record<string, Transfer["status"]> = {
  SUCCESS: "completed", FAILED: "failed", PROCESSING: "pending",
};
export async function asterTransfers(request: Request, path: string, since: number) {
  const result: Transfer[] = [];
  for (const row of records(await request(path, "fapiPrivate", {}, 5, "POST")) as Row[]) {
    const occurredAt = time(row.time);
    if (occurredAt.getTime() < since) continue;
    const kind = String(row.type).toUpperCase();
    if (kind !== "DEPOSIT" && kind !== "WITHDRAW") throw new ExchangeError("INVALID_RESPONSE");
    const chain = text(row.chainId);
    result.push({
      direction: kind === "DEPOSIT" ? "deposit" : "withdrawal",
      asset: required(row.asset),
      network: chain === null ? null : (ASTER_CHAINS[chain] ?? `Chain ${chain}`),
      amount: requiredDecimal(row.amount),
      fee: null,
      address: null,
      txHash: text(row.txHash),
      status: ASTER_STATUS[String(row.state).toUpperCase()] ?? "pending",
      externalId: required(row.id ?? row.txHash),
      occurredAt,
    });
  }
  return result;
}

// ── BingX: /openApi/api/v3/capital/{deposit/hisrec, withdraw/history}, Binance-shaped, 90-day windows ──
const BINGX_DEPOSIT: Record<string, Transfer["status"]> = { "0": "pending", "6": "pending", "1": "completed" };
const BINGX_WITHDRAWAL: Record<string, Transfer["status"]> = {
  "4": "pending", "5": "failed", "6": "completed",
};
export async function bingxTransfers(
  request: Request,
  unwrap: (response: unknown) => unknown,
  since: number,
  now = Date.now(),
) {
  const result: Transfer[] = [];
  for (const [startTime, endTime] of windows(since, now, 90 * DAY)) {
    for (const row of records(
      unwrap(await request("capital/deposit/hisrec", "api:v3:private", { startTime, endTime, limit: 1000 }, 1)),
    ) as Row[])
      result.push({
        direction: "deposit",
        asset: required(row.coin),
        network: text(row.network),
        amount: requiredDecimal(row.amount),
        fee: null,
        address: text(row.address),
        txHash: text(row.txId),
        status: BINGX_DEPOSIT[String(row.status)] ?? "pending",
        externalId: required(row.id ?? row.txId),
        occurredAt: time(row.insertTime),
      });
    for (const row of records(
      unwrap(await request("capital/withdraw/history", "api:v3:private", { startTime, endTime, limit: 1000 }, 1)),
    ) as Row[])
      result.push({
        direction: "withdrawal",
        asset: required(row.coin),
        network: text(row.network),
        amount: requiredDecimal(row.amount),
        fee: fee(row.transactionFee),
        address: text(row.address),
        txHash: text(row.txId),
        status: BINGX_WITHDRAWAL[String(row.status)] ?? "pending",
        externalId: required(row.id ?? row.txId),
        occurredAt: time(row.applyTime),
      });
  }
  return result;
}

// ── Bitget: classic v2/spot/wallet/{deposit,withdrawal}-records (90 days) or UTA v3/account/... (30 days) ──
const BITGET_PAGE = 100;
const BITGET_STATUS: Record<string, Transfer["status"]> = { success: "completed", fail: "failed", failed: "failed" };
export async function bitgetTransfers(
  data: (path: string, api: string, params: Row) => Promise<unknown>,
  uta: boolean,
  since: number,
  now = Date.now(),
) {
  const byId = new Map<string, Transfer>();
  const api = uta ? "private:uta" : "private:spot";
  const span = (uta ? 30 : 90) * DAY;
  for (const direction of ["deposit", "withdrawal"] as const) {
    const path = uta
      ? `v3/account/${direction === "deposit" ? "deposit" : "withdrawal"}-records`
      : `v2/spot/wallet/${direction === "deposit" ? "deposit" : "withdrawal"}-records`;
    // A full page may hide older rows: split the range until every part fits one page.
    const read = async (startTime: number, endTime: number, depth = 0): Promise<void> => {
      const rows = records(await data(path, api, { startTime, endTime, limit: BITGET_PAGE })) as Row[];
      if (rows.length >= BITGET_PAGE && endTime - startTime > 3_600_000 && depth < 12) {
        const mid = Math.floor((startTime + endTime) / 2);
        await read(startTime, mid, depth + 1);
        await read(mid + 1, endTime, depth + 1);
        return;
      }
      for (const row of rows) {
        const id = required(row.orderId ?? row.recordId ?? row.tradeId);
        byId.set(`${direction}:${id}`, {
          direction,
          asset: required(row.coin),
          network: text(row.chain),
          amount: requiredDecimal(row.size),
          fee: direction === "withdrawal" ? fee(row.fee) : null,
          address: text(row.toAddress),
          txHash: text(row.tradeId ?? row.recordId),
          status: BITGET_STATUS[String(row.status).toLowerCase()] ?? "pending",
          externalId: id,
          occurredAt: time(row.cTime ?? row.createdTime),
        });
      }
    };
    for (const [start, end] of windows(since, now, span)) await read(start, end);
  }
  return [...byId.values()];
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

// ── KuCoin: /api/v1/deposits and /api/v1/withdrawals, paged, read a week at a time ──
const KUCOIN_STATUS: Record<string, Transfer["status"]> = {
  SUCCESS: "completed",
  FAILURE: "failed",
  PROCESSING: "pending",
  WALLET_PROCESSING: "pending",
  REVIEW: "pending",
};
const KUCOIN_PAGE = 100;
export async function kucoinTransfers(
  data: (path: string, params: Row) => Promise<unknown>,
  since: number,
  now = Date.now(),
) {
  const byId = new Map<string, Transfer>();
  for (const direction of ["deposit", "withdrawal"] as const) {
    const path = direction === "deposit" ? "deposits" : "withdrawals";
    for (const [startAt, endAt] of windows(since, now, 7 * DAY)) {
      for (let currentPage = 1; currentPage <= 50; currentPage++) {
        const page = record(await data(path, { startAt, endAt, currentPage, pageSize: KUCOIN_PAGE }));
        for (const row of records(page.items)) {
          const asset = required(row.currency);
          const amount = requiredDecimal(row.amount);
          // Withdrawals carry no id; time, coin, amount and chain stay fixed while the hash may appear later.
          const id = text(row.id) ?? `${required(row.createdAt)}:${asset}:${amount}:${text(row.chain) ?? ""}`;
          byId.set(`${direction}:${id}`, {
            direction,
            asset,
            network: text(row.chain),
            amount,
            fee: direction === "withdrawal" ? fee(row.fee) : null,
            address: text(row.address),
            txHash: text(row.walletTxId),
            status: KUCOIN_STATUS[String(row.status).toUpperCase()] ?? "pending",
            externalId: id,
            occurredAt: time(row.createdAt),
          });
        }
        if (currentPage >= Number(page.totalPage ?? 1)) break;
      }
    }
  }
  return [...byId.values()];
}
