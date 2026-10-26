import { describe, expect, it } from "vitest";
import {
  asterTransfers,
  binanceTransfers,
  bingxTransfers,
  bitgetTransfers,
  bybitTransfers,
  gateTransfers,
  hyperliquidTransfers,
  okxTransfers,
  windows,
} from "./transfers";
import type { Request } from "./transport";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22);

/** Answers each path with the given body; records the calls. */
function mock(bodies: Record<string, unknown | ((params: Record<string, unknown>) => unknown)>) {
  const calls: { path: string; api: string; params: Record<string, unknown> }[] = [];
  const request: Request = async (path, api, params = {}) => {
    calls.push({ path, api, params });
    const body = bodies[path];
    return typeof body === "function" ? (body as (p: Record<string, unknown>) => unknown)(params) : body ?? [];
  };
  return { request, calls };
}

describe("exchange transfer history", () => {
  it("covers a range with windows no longer than the exchange allows", () => {
    expect(windows(0, 70 * DAY, 30 * DAY)).toEqual([
      [0, 30 * DAY - 1],
      [30 * DAY, 60 * DAY - 1],
      [60 * DAY, 70 * DAY],
    ]);
  });

  it("reads Binance deposits and withdrawals", async () => {
    const { request, calls } = mock({
      "capital/deposit/hisrec": [
        { id: "d1", coin: "USDT", network: "TRX", amount: "500", address: "T1", txId: "0xaaa", status: 1, insertTime: NOW - DAY },
      ],
      "capital/withdraw/history": [
        { id: "w1", coin: "ETH", network: "ARBITRUM", amount: "0.2", transactionFee: "0.0001", address: "0xme", txId: "0xbbb", status: 6, applyTime: "2026-10-20 11:12:02" },
      ],
    });
    const rows = await binanceTransfers(request, NOW - 10 * DAY, NOW);
    expect(calls.every((call) => call.api === "sapi")).toBe(true);
    expect(rows).toEqual([
      expect.objectContaining({ direction: "deposit", asset: "USDT", amount: "500", txHash: "0xaaa", status: "completed", externalId: "d1" }),
      expect.objectContaining({ direction: "withdrawal", asset: "ETH", fee: "0.0001", status: "completed", occurredAt: new Date("2026-10-20T11:12:02Z") }),
    ]);
  });

  it("reads Bybit pages and maps statuses", async () => {
    const { request, calls } = mock({
      "v5/asset/deposit/query-record": (params: Record<string, unknown>) => ({
        retCode: 0,
        result: params.cursor
          ? { rows: [{ id: "d2", coin: "USDC", chain: "ETH", amount: "10", txID: "0x2", status: 3, successAt: String(NOW - 2 * DAY) }], nextPageCursor: "" }
          : { rows: [{ id: "d1", coin: "USDC", chain: "ETH", amount: "5", txID: "0x1", status: 1, successAt: String(NOW - DAY) }], nextPageCursor: "next" },
      }),
      "v5/asset/withdraw/query-record": {
        retCode: 0,
        result: { rows: [{ withdrawId: "w1", coin: "BTC", chain: "BTC", amount: "0.01", withdrawFee: "0.0002", txID: "abc", status: "success", createTime: String(NOW - DAY), toAddress: "bc1" }], nextPageCursor: "" },
      },
    });
    const rows = await bybitTransfers(request, NOW - 5 * DAY, NOW);
    expect(calls.filter((call) => call.path.includes("deposit"))).toHaveLength(2);
    expect(rows.map((row) => [row.direction, row.externalId, row.status])).toEqual([
      ["deposit", "d1", "pending"],
      ["deposit", "d2", "completed"],
      ["withdrawal", "w1", "completed"],
    ]);
  });

  it("stops OKX paging at the start of the range", async () => {
    const { request } = mock({
      "asset/deposit-history": { code: "0", data: [
        { depId: "d1", ccy: "SOL", chain: "SOL-Solana", amt: "3", txId: "sig1", state: "2", ts: String(NOW - DAY) },
        { depId: "d0", ccy: "SOL", chain: "SOL-Solana", amt: "1", txId: "sig0", state: "2", ts: String(NOW - 40 * DAY) },
      ] },
      "asset/withdrawal-history": { code: "0", data: [
        { wdId: "w1", ccy: "USDT", chain: "USDT-TRC20", amt: "100", fee: "1", txId: "t1", state: "-1", ts: String(NOW - DAY) },
      ] },
    });
    const rows = await okxTransfers(request, NOW - 30 * DAY);
    expect(rows.map((row) => [row.direction, row.externalId, row.status])).toEqual([
      ["deposit", "d1", "completed"],
      ["withdrawal", "w1", "failed"],
    ]);
  });

  it("reads Gate wallet history in seconds", async () => {
    const { request, calls } = mock({
      deposits: [{ id: "d1", currency: "GT", chain: "GTEVM", amount: "4", txid: "0xg", status: "DONE", timestamp: String((NOW - DAY) / 1000) }],
      withdrawals: [{ id: "w1", currency: "USDT", chain: "TRX", amount: "50", fee: "1", txid: "t2", status: "PEND", timestamp: String((NOW - DAY) / 1000) }],
    });
    const rows = await gateTransfers(request, NOW - 3 * DAY, NOW);
    expect(calls[0]).toMatchObject({ api: "private:wallet", params: { from: (NOW - 3 * DAY) / 1000 } });
    expect(rows.map((row) => [row.direction, row.status, row.occurredAt.getTime()])).toEqual([
      ["deposit", "completed", NOW - DAY],
      ["withdrawal", "pending", NOW - DAY],
    ]);
  });

  it("keeps only Hyperliquid bridge deposits and withdrawals", async () => {
    const rows = await hyperliquidTransfers(
      async () => [
        { time: NOW - DAY, hash: "0xh1", delta: { type: "deposit", usdc: "1000" } },
        { time: NOW - DAY, hash: "0xh2", delta: { type: "accountClassTransfer", usdc: "5" } },
        { time: NOW - DAY, hash: "0xh3", delta: { type: "withdraw", usdc: "200", fee: "1" } },
      ],
      "0x" + "a".repeat(40),
      NOW - 2 * DAY,
    );
    expect(rows.map((row) => [row.direction, row.amount, row.fee, row.txHash])).toEqual([
      ["deposit", "1000", null, "0xh1"],
      ["withdrawal", "200", "1", "0xh3"],
    ]);
  });
});

describe("Aster, BingX and Bitget transfer history", () => {
  it("reads Aster deposits and withdrawals with a POST history and skips older rows", async () => {
    const { request, calls } = mock({
      "v3/aster/deposit-withdraw-history": [
        { id: "1", type: "DEPOSIT", asset: "USDT", amount: "100", state: "SUCCESS", txHash: "0xabc", time: NOW - DAY, chainId: 56 },
        { id: "2", type: "WITHDRAW", asset: "USDT", amount: "40", state: "PROCESSING", txHash: null, time: NOW - 2 * DAY, chainId: 42161 },
        { id: "3", type: "DEPOSIT", asset: "USDT", amount: "5", state: "SUCCESS", txHash: "0xold", time: NOW - 400 * DAY, chainId: 1 },
      ],
    });
    const rows = await asterTransfers(request, "v3/aster/deposit-withdraw-history", NOW - 365 * DAY);
    expect(calls[0]).toMatchObject({ api: "fapiPrivate" });
    expect(rows.map((r) => [r.direction, r.network, r.status, r.externalId])).toEqual([
      ["deposit", "BSC", "completed", "1"],
      ["withdrawal", "Arbitrum", "pending", "2"],
    ]);
  });

  it("reads BingX history in the Binance shape", async () => {
    const { request } = mock({
      "capital/deposit/hisrec": { code: 0, data: [{ coin: "USDT", network: "BEP20", amount: "7", status: 1, txId: "0x1", insertTime: NOW - DAY }] },
      "capital/withdraw/history": { code: 0, data: [{ id: "w1", coin: "ETH", network: "ETH", amount: "1", transactionFee: "0.01", status: 6, txId: "0x2", applyTime: "2026-10-20 10:00:00" }] },
    });
    const rows = await bingxTransfers(request, (r) => (r as { data: unknown }).data, NOW - 30 * DAY, NOW);
    expect(rows.map((r) => [r.direction, r.status, r.fee])).toEqual([
      ["deposit", "completed", null],
      ["withdrawal", "completed", "0.01"],
    ]);
  });

  it("reads Bitget classic records and splits a full page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      orderId: `o${i}`, coin: "USDT", size: "1", status: "success", chain: "TRC20", cTime: String(NOW - DAY), tradeId: `t${i}`,
    }));
    let deposits = 0;
    const data = async (path: string) => {
      if (!path.includes("deposit")) return [];
      const call = deposits++;
      return call === 0 ? full : call === 1 ? full.slice(0, 3) : [];
    };
    const rows = await bitgetTransfers(data, false, NOW - 10 * DAY, NOW);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ direction: "deposit", status: "completed", network: "TRC20" });
  });
});
