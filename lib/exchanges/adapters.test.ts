import { describe, expect, it, vi } from "vitest";
import { BybitAdapter, BinanceAdapter } from "./adapters";
import type { Request } from "./transport";
const ok = (result: unknown) => ({ retCode: 0, result });
const rates = async () =>
  new Map([
    ["USDT", "0.99"],
    ["USDC", "1.01"],
  ]);
function bybitMock(overrides: Partial<Record<string, unknown>> = {}): Request {
  return vi.fn(
    async (
      path: string,
      _api: string,
      params: Record<string, unknown> = {},
    ) => {
      if (path in overrides) {
        const val = overrides[path];
        if (val instanceof Error) throw val;
        return val;
      }
      if (path === "v5/user/query-api")
        return ok({
          readOnly: 1,
          ips: ["203.0.113.10"],
          permissions: {},
          userID: "account-1",
        });
      if (path === "v5/account/info")
        return ok({ unifiedMarginStatus: 5, marginMode: "REGULAR_MARGIN" });
      if (path === "v5/market/instruments-info")
        return ok({
          list: [{ symbol: "BTCUSDT", baseCoin: "BTC", settleCoin: "USDT" }],
        });
      if (path === "v5/account/wallet-balance")
        return ok({
          list: [
            {
              totalEquity: "99",
              totalAvailableBalance: "49.5",
              coin: [
                {
                  coin: "USDT",
                  walletBalance: "110",
                  spotBorrow: "10",
                  borrowAmount: "10",
                  equity: "100",
                  usdValue: "99",
                  locked: "20",
                },
              ],
            },
          ],
        });
      if (path === "v5/position/list" && params.settleCoin === "USDT")
        return ok({
          list: [
            {
              symbol: "BTCUSDT",
              positionIdx: 1,
              side: "Buy",
              size: "0.001234567890123456",
              avgPrice: "50000",
              markPrice: "49000",
              unrealisedPnl: "-1",
              liqPrice: "",
              leverage: "5",
              positionIM: "10",
            },
            {
              symbol: "BTCUSDT",
              positionIdx: 2,
              side: "Sell",
              size: "0.002",
              avgPrice: "50000",
              markPrice: "49000",
              unrealisedPnl: "2",
              liqPrice: "",
              leverage: "5",
              positionIM: "20",
            },
          ],
        });
      if (path === "v5/position/list") return ok({ list: [] });
      throw new Error("Unexpected request");
    },
  );
}
describe("Bybit normalization", () => {
  it("keeps hedge sides separate and preserves precision, equity and liabilities", async () => {
    const adapter = new BybitAdapter(bybitMock(), rates);
    await adapter.verify();
    const { accounts } = await adapter.fetch();
    const a = accounts[0]!;
    expect(a.equityUsd).toBe("99");
    expect(a.balances[0]!.total).toBe("100");
    expect(a.balances[0]!.debt).toBe("10");
    expect(a.positions).toHaveLength(2);
    expect(a.positions![0]!.baseSize).toBe("0.001234567890123456");
    expect(a.positions![0]!.liquidationPrice).toBeNull();
    expect(a.positions![0]!.unrealizedPnlUsd).toBe("-0.99");
    expect(a.positions![0]!.positionKey).not.toBe(a.positions![1]!.positionKey);
    expect(a.unrealizedPnlUsd).toBe("0.99"); // NOT added again to equity
  });
  it("treats missing FX as incomplete, never assumes a stablecoin peg", async () => {
    const adapter = new BybitAdapter(bybitMock(), async () => new Map());
    await adapter.verify();
    const result = await adapter.fetch();
    expect(result.accounts[0]!.complete).toBe(false);
    expect(result.accounts[0]!.positions![0]!.unrealizedPnlUsd).toBeNull();
  });
  it("rejects portfolio margin", async () => {
    const adapter = new BybitAdapter(
      bybitMock({
        "v5/account/info": ok({
          unifiedMarginStatus: 5,
          marginMode: "PORTFOLIO_MARGIN",
        }),
      }),
      rates,
    );
    await expect(adapter.verify()).rejects.toThrow("UNSUPPORTED_ACCOUNT");
  });
  it("fails the whole account on repeated pagination cursors instead of closing unseen positions", async () => {
    const adapter = new BybitAdapter(
      bybitMock({
        "v5/position/list": ok({ list: [], nextPageCursor: "repeat" }),
      }),
      rates,
    );
    await adapter.verify();
    await expect(adapter.fetch()).rejects.toThrow("INVALID_RESPONSE");
  });
  it("follows all pages and does not convert a later page failure into empty results", async () => {
    const base = bybitMock();
    let page = 0;
    const request: Request = async (path, api, params) => {
      if (path === "v5/position/list" && params?.settleCoin === "USDT") {
        if (page++ === 0) return ok({ list: [], nextPageCursor: "page-2" });
        throw new Error("network interruption");
      }
      return base(path, api, params);
    };
    const adapter = new BybitAdapter(request, rates);
    await adapter.verify();
    await expect(adapter.fetch()).rejects.toThrow("network interruption");
  });
});
describe("Binance independent accounts", () => {
  it("retains spot when futures are unavailable and includes unpriced assets", async () => {
    const request: Request = async (path, api) => {
      if (api.startsWith("fapi")) {
        const error = new Error("private provider details");
        error.name = "PermissionDenied";
        throw error;
      }
      if (path === "exchangeInfo")
        return {
          symbols: [
            { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
          ],
        };
      if (path === "ticker/price")
        return [{ symbol: "BTCUSDT", price: "50000" }];
      if (path === "account")
        return {
          balances: [
            { asset: "BTC", free: "1", locked: "0.1" },
            { asset: "UNKNOWN", free: "7", locked: "0" },
          ],
        };
      throw new Error("Unexpected request");
    };
    const result = await new BinanceAdapter(request, rates).fetch(true);
    expect(result.accounts[0]!.equityUsd).toBe("54450");
    expect(result.accounts[0]!.complete).toBe(false);
    expect(result.accounts[0]!.balances[1]!.usdValue).toBeNull();
    expect(result.failedAccounts).toEqual([
      {
        accountKey: "futures",
        kind: "futures",
        errorCode: "FUTURES_UNAVAILABLE",
      },
    ]);
  });
  it("does not sum notional or PnL again into futures equity", async () => {
    const request: Request = async (path) => {
      if (path === "exchangeInfo")
        return {
          symbols: [
            { symbol: "BTCUSDT", baseAsset: "BTC", marginAsset: "USDT" },
          ],
        };
      if (path === "account")
        return {
          assets: [
            {
              asset: "USDT",
              walletBalance: "1000",
              marginBalance: "900",
              availableBalance: "500",
            },
          ],
        };
      if (path === "positionRisk")
        return [
          {
            symbol: "BTCUSDT",
            positionSide: "SHORT",
            positionAmt: "-0.1",
            notional: "-5000",
            entryPrice: "49000",
            markPrice: "50000",
            unRealizedProfit: "-100",
            liquidationPrice: "0",
            positionInitialMargin: "100",
            isolatedWallet: "0",
          },
        ];
      throw new Error("Unexpected request");
    };
    const result = await new BinanceAdapter(request, rates).fetch(false),
      a = result.accounts[0]!;
    expect(a.equityUsd).toBe("891");
    expect(a.positions![0]!.notionalUsd).toBe("4950");
    expect(a.positions![0]!.side).toBe("short");
  });
});
