import { describe, expect, it } from "vitest";
import { KucoinAdapter, kucoinAsset, kucoinData, kucoinErrorCode } from "./kucoin";
import type { Request } from "./transport";

const ok = (data: unknown) => ({ code: "200000", data });

function adapter(routes: Record<string, unknown | ((params: Record<string, unknown>) => unknown)>) {
  const calls: { path: string; api: string; params: Record<string, unknown> }[] = [];
  const request: Request = async (path, api, params = {}) => {
    calls.push({ path, api, params });
    const route = routes[path];
    if (route === undefined) throw new Error(`unexpected ${path}`);
    const value = typeof route === "function" ? (route as (p: Record<string, unknown>) => unknown)(params) : route;
    if (value instanceof Error) throw value;
    return value;
  };
  const prices = async () => new Map([["USDT", "1"], ["USDC", "1"], ["BTC", "80000"]]);
  return { adapter: new KucoinAdapter(request, prices), calls };
}

const contract = {
  symbol: "XBTUSDTM", baseCurrency: "XBT", settleCurrency: "USDT", multiplier: 0.001,
  fundingFeeRate: 0.0001, nextFundingRateDateTime: Date.now() + 3_600_000,
};
const position = {
  symbol: "XBTUSDTM", isOpen: true, currentQty: -20, positionSide: "BOTH", markPrice: 80000,
  avgEntryPrice: 82000, liquidationPrice: 95000, leverage: 10, marginMode: "CROSS", settleCurrency: "USDT",
  isInverse: false, unrealisedPnl: 40, realisedGrossPnl: 0, realisedCost: 1.2, posFunding: -0.5,
  posMargin: 160, openingTimestamp: 1_790_000_000_000,
};

describe("KuCoin", () => {
  it("maps its business codes", () => {
    expect(() => kucoinData({ code: "400004" })).toThrow("INVALID_KEY");
    expect(() => kucoinData({ code: "400006" })).toThrow("IP_RESTRICTED");
    expect(() => kucoinData({ code: "400007" }, "FUTURES_UNAVAILABLE")).toThrow("FUTURES_UNAVAILABLE");
    expect(() => kucoinData({ code: "429000" })).toThrow("RATE_LIMIT");
    expect(kucoinErrorCode(new Error('kucoin GET … 403 Forbidden {"code":"400007","msg":"Access denied"}'))).toBe("400007");
    expect(kucoinErrorCode(new Error("socket hang up"))).toBeNull();
    expect(kucoinAsset("xbt")).toBe("BTC");
  });

  it("accepts only a General (read) key", async () => {
    const good = adapter({ "user/api-key": ok({ permission: "General", uid: 165001215 }) });
    expect(await good.adapter.verify()).toEqual({ externalAccountId: "165001215" });
    expect(good.calls[0]).toMatchObject({ api: "private", params: { version: "v1" } });
    const trading = adapter({ "user/api-key": ok({ permission: "General,Futures", uid: 1 }) });
    await expect(trading.adapter.verify()).rejects.toThrow("UNSAFE_KEY");
  });

  it("reads spot and futures with the position size in coins", async () => {
    const { adapter: a } = adapter({
      "market/allTickers": ok({ ticker: [{ symbol: "KCS-USDT", last: "10" }] }),
      accounts: ok([
        { currency: "USDT", type: "main", balance: "100", available: "100", holds: "0" },
        { currency: "USDT", type: "trade", balance: "50", available: "40", holds: "10" },
        { currency: "KCS", type: "trade", balance: "3", available: "3", holds: "0" },
        { currency: "BTC", type: "margin", balance: "1", available: "1", holds: "0" },
      ]),
      "account-overview": (p: Record<string, unknown>) =>
        ok(p.currency === "USDT"
          ? { currency: "USDT", accountEquity: 1040, unrealisedPNL: 40, availableBalance: 800 }
          : { currency: "USDC", accountEquity: 0, unrealisedPNL: 0, availableBalance: 0 }),
      positions: ok([position]),
      "contracts/active": ok([contract]),
    });
    const result = await a.fetch(true);
    expect(result.failedAccounts).toEqual([]);
    const [spot, futures] = result.accounts;
    expect(spot!.balances.map((b) => [b.symbol, b.total, b.usdValue])).toEqual([["USDT", "150", "150"], ["KCS", "3", "30"]]);
    expect(spot!.equityUsd).toBe("180");
    expect(futures!.equityUsd).toBe("1040");
    expect(futures!.balances).toMatchObject([{ symbol: "USDT", total: "1000" }]);
    expect(futures!.positions![0]).toMatchObject({
      base: "BTC", side: "short", contracts: "20", contractSize: "0.001", baseSize: "0.02",
      notionalUsd: "1600", marginMode: "cross", unrealizedPnlUsd: "40",
    });
    expect(futures!.positions![0]!.funding).toMatchObject({ amount: "-0.5", tradingFees: "-1.2", status: "complete" });
  });

  it("keeps spot when the key may not read futures", async () => {
    const denied = new Error('kucoin GET https://api-futures.kucoin.com/api/v1/account-overview 403 {"code":"400007"}');
    const { adapter: a } = adapter({
      "market/allTickers": ok({ ticker: [] }),
      accounts: ok([{ currency: "USDT", type: "trade", balance: "5", available: "5", holds: "0" }]),
      "account-overview": denied,
    });
    const result = await a.fetch(true);
    expect(result.accounts.map((x) => x.accountKey)).toEqual(["spot"]);
    expect(result.failedAccounts).toEqual([{ accountKey: "futures", kind: "futures", errorCode: "FUTURES_UNAVAILABLE" }]);
  });

  it("takes the exact close result from position history", async () => {
    const lastSeenAt = Date.now() - 60_000;
    const { adapter: a } = adapter({
      "history-positions": ok({ items: [
        { symbol: "XBTUSDTM", settleCurrency: "USDT", side: "SHORT", pnl: "37.25", closeTime: lastSeenAt + 30_000 },
      ] }),
    });
    const input = { symbol: "XBTUSDTM", base: "BTC", settle: "USDT", positionKey: "XBTUSDTM:short:cross", since: lastSeenAt - 3_600_000, lastSeenAt, otherLeg: false };
    expect(await a.closedResult(input)).toBe("37.25");
    expect(await a.closedResult({ ...input, positionKey: "XBTUSDTM:long:cross" })).toBeNull();
  });

  it("reads deposits and withdrawals page by page", async () => {
    const { adapter: a } = adapter({
      deposits: () => ok({ totalPage: 1, items: [
        { id: "d1", currency: "USDT", chain: "trx", status: "SUCCESS", amount: "100", walletTxId: "abc", address: "T1", createdAt: Date.now() - 1000 },
      ] }),
      withdrawals: ok({ totalPage: 1, items: [
        { currency: "USDT", chain: "bsc", status: "PROCESSING", amount: "20", fee: "1", walletTxId: null, address: "0xabc", createdAt: Date.now() - 2000 },
      ] }),
    });
    const rows = await a.transfers(Date.now() - 86_400_000);
    expect(rows).toEqual([
      expect.objectContaining({ direction: "deposit", externalId: "d1", status: "completed", txHash: "abc", network: "trx" }),
      expect.objectContaining({ direction: "withdrawal", status: "pending", fee: "1", amount: "20" }),
    ]);
  });
});
