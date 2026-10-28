import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("./rate-budget", () => ({
  reserveRequest: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => vi.unstubAllGlobals());
import { AsterAdapter } from "./aster";
const address = `0x${"a".repeat(40)}`;
function response() {
  return {
    result: {
      address,
      accountPrivacy: "disabled",
      perpAssets: [{ asset: "USDT", walletBalance: "100.123456789123456789" }],
      positions: [
        {
          tradingProduct: "perps",
          positions: [
            {
              id: "btc",
              symbol: "BTCUSDT",
              collateral: "USDT",
              positionAmount: "-0.01",
              positionSide: "BOTH",
              entryPrice: "70000",
              markPrice: "69000",
              notionalValue: "690",
              unrealizedProfit: "10",
              leverage: 5,
              isolated: false,
              marginValue: "138",
            },
          ],
        },
      ],
    },
  };
}
const prices = async () => new Map([["USDT", "0.99"]]);
describe("Aster public wallet adapter", () => {
  it("fills a short's mark from the premium index and derives its entry", async () => {
    const raw = {
      result: {
        address,
        accountPrivacy: "disabled",
        perpAssets: [{ asset: "USDT", walletBalance: "100" }],
        positions: [
          {
            tradingProduct: "perps",
            positions: [
              {
                id: "1_PREDICTUSDT_SHORT",
                symbol: "PREDICTUSDT",
                positionAmount: "-1100",
                positionSide: "SHORT",
                notionalValue: "1535.41",
                unrealizedProfit: "-16.5",
              },
            ],
          },
        ],
      },
    };
    const result = await new AsterAdapter(
      address,
      async () => new Map([["USDT", "1"]]),
      async () => raw,
      async () => [
        { symbol: "PREDICTUSDT", markPrice: "1.4", lastFundingRate: "0.0001" },
      ],
    ).fetch();
    // Short: entry = mark + PnL per unit = 1.4 + (-16.5 / 1100) = 1.385.
    expect(result.accounts[0]!.positions![0]).toMatchObject({
      side: "short",
      markPrice: "1.4",
      entryPrice: "1.385",
      leverage: null,
    });
  });
  it("accepts the reduced live RPC response for positions opened before linking", async () => {
    const raw = {
      result: {
        address,
        accountPrivacy: "disabled",
        perpAssets: [{ asset: "USDT", walletBalance: "-833.34159171" }],
        positions: [
          {
            tradingProduct: "perps",
            positions: [
              {
                id: "98000003122518_ETHUSDT_LONG",
                symbol: "ETHUSDT",
                positionAmount: "1.090",
                positionSide: "LONG",
                notionalValue: "2697.01970000000",
                unrealizedProfit: "927.12130000000",
                cumRealized: "317.09328003",
              },
            ],
          },
        ],
      },
    };
    const result = await new AsterAdapter(
      address,
      async () => new Map([["USDT", "1"]]),
      async () => raw,
      async () => [],
    ).fetch();
    expect(result.accounts[0]!.positions![0]).toMatchObject({
      base: "ETH",
      settle: "USDT",
      side: "long",
      baseSize: "1.09",
      notionalUsd: "2697.0197",
      unrealizedPnl: "927.1213",
      // Mark from notional / size (no premium index here); entry from mark, PnL and size.
      entryPrice: "1623.76",
      markPrice: "2474.33",
      leverage: null,
      marginMode: null,
      margin: null,
      funding: { amount: null, realizedPnl: null, tradingFees: null },
    });
    expect(result.accounts[0]!.equityUsd).toBe("93.77970829");
    expect(result.accounts[0]!.complete).toBe(true);
  });
  it("sends only the documented public read request and preserves numeric JSON balances", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `{"result":{"address":"${address}","accountPrivacy":"disabled","perpAssets":[{"asset":"USDT","walletBalance":100.123456789123456789}],"positions":[]}}`,
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await new AsterAdapter(address, prices).fetch();
    expect(result.accounts[0]!.balances[0]!.total).toBe(
      "100.123456789123456789",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe("https://tapi.asterdex.com/info");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toMatchObject({
      method: "aster_getBalance",
      params: [address, "latest"],
    });
  });
  it("converts equity once, identifies short positions, keeps unavailable cash flows unknown", async () => {
    const next = Date.now() + 3600000;
    const premium = vi.fn().mockResolvedValue([
      {
        symbol: "BTCUSDT",
        lastFundingRate: "-0.0001",
        nextFundingTime: next,
      },
    ]);
    const adapter = new AsterAdapter(
      address,
      prices,
      async () => response(),
      premium,
    );
    const result = await adapter.fetch();
    expect(result.accounts[0]!.equityUsd).toBe("109.022222221232222221");
    expect(result.accounts[0]!.positions![0]!).toMatchObject({
      side: "short",
      baseSize: "0.01",
      notionalUsd: "683.1",
      unrealizedPnlUsd: "9.9",
      liquidationPrice: null,
      funding: {
        status: "unavailable",
        amount: null,
        realizedPnl: null,
        tradingFees: null,
        nextRate: "-0.0001",
        nextTime: next,
      },
    });
    expect(result.failedAccounts).toEqual([]);
    await adapter.fetch();
    expect(premium).toHaveBeenCalledTimes(1);
  });
  it("handles hedge sides even when short quantity is positive", async () => {
    const raw = response();
    raw.result.positions[0]!.positions[0]!.positionAmount = "0.01";
    raw.result.positions[0]!.positions[0]!.positionSide = "SHORT";
    const result = await new AsterAdapter(
      address,
      prices,
      async () => raw,
      async () => [],
    ).fetch();
    expect(result.accounts[0]!.positions![0]!.side).toBe("short");
  });
  it("rejects private and malformed responses instead of returning verified empty positions", async () => {
    for (const [raw, code] of [
      [{ result: { address, accountPrivacy: "enabled" } }, "PRIVATE_ACCOUNT"],
      [{ result: { address, accountPrivacy: "disabled" } }, "INVALID_RESPONSE"],
      [
        { result: { ...response().result, address: `0x${"b".repeat(40)}` } },
        "INVALID_RESPONSE",
      ],
    ] as const) {
      await expect(
        new AsterAdapter(address, prices, async () => raw).fetch(),
      ).rejects.toMatchObject({ code });
    }
  });
  it("does not assume stablecoin parity or suppress valid positions when market data fails", async () => {
    const result = await new AsterAdapter(
      address,
      async () => new Map(),
      async () => response(),
      async () => {
        throw Error();
      },
    ).fetch();
    expect(result.accounts[0]!).toMatchObject({
      equityUsd: null,
      complete: false,
      errorCode: "UNPRICED_ASSETS",
    });
    expect(result.accounts[0]!.positions).toHaveLength(1);
  });
  it("accepts verified empty accounts", async () => {
    const result = await new AsterAdapter(address, prices, async () => ({
      result: {
        address,
        accountPrivacy: "disabled",
        perpAssets: [],
        positions: [],
      },
    })).fetch();
    expect(result.accounts[0]!.positions).toEqual([]);
    expect(result.accounts[0]!.equityUsd).toBe("0");
  });
  it("treats a missing positions list as none when account data is present", async () => {
    const result = await new AsterAdapter(address, prices, async () => ({
      result: {
        address,
        accountPrivacy: "disabled",
        perpAssets: [{ asset: "USDT", walletBalance: "50" }],
        staking: { totalStakedAmount: null },
      },
    })).fetch();
    expect(result.accounts[0]!.positions).toEqual([]);
    expect(result.accounts[0]!.equityUsd).toBe("49.5");
  });
  it("reads Shield Mode positions and counts their margin as locked collateral", async () => {
    // Shape observed from the live RPC in October 2026 (lossless numbers as strings).
    const result = await new AsterAdapter(
      address,
      async () => new Map([["USDT", "1"]]),
      async () => ({
        result: {
          address,
          accountPrivacy: "disabled",
          perpAssets: [{ asset: "USDT", walletBalance: "240.73405729" }],
          positions: [
            {
              tradingProduct: "shieldmode",
              positions: [
                {
                  positionId: "1164712525996998700",
                  symbol: "ETHUSDT",
                  isLong: true,
                  leverage: "1001",
                  marginAsset: "USDT",
                  margin: "5",
                  entryPrice: "2407.0387822",
                  liqPrice: "2405.47577",
                  qty: "2.07931838",
                  tp: null,
                  sl: null,
                  cumFundingFee: "0",
                  pnl2usdt: "-0.9488433",
                  pnlPercentage: "-0.18976866",
                  createTime: "1792453904150",
                  feeMode: "PROFIT",
                },
              ],
            },
          ],
          staking: {},
        },
      }),
      async () => [
        {
          symbol: "ETHUSDT",
          markPrice: "2407.12",
          lastFundingRate: "0.0001",
          nextFundingTime: Date.now() + 3600_000,
        },
      ],
    ).fetch();
    const account = result.accounts[0]!;
    expect(account.positions).toHaveLength(1);
    expect(account.positions![0]).toMatchObject({
      positionKey: "shield:1164712525996998700",
      side: "long",
      baseSize: "2.07931838",
      markPrice: "2407.12",
      liquidationPrice: "2405.47577",
      leverage: "1001",
      marginMode: "isolated",
      margin: "5",
      unrealizedPnlUsd: "-0.9488433",
    });
    expect(account.balances).toContainEqual(
      expect.objectContaining({ assetId: "aster:shield:USDT", locked: "5" }),
    );
    // 240.73405729 cash + 5 margin - 0.9488433 PnL
    expect(account.equityUsd).toBe("244.78521399");
    expect(account.complete).toBe(true);
  });
  it("keeps syncing known data when Aster adds an unknown product", async () => {
    const raw = response();
    raw.result.positions.push({
      tradingProduct: "future-product",
      positions: [],
    });
    const result = await new AsterAdapter(
      address,
      prices,
      async () => raw,
    ).fetch();
    expect(result.accounts[0]!).toMatchObject({
      complete: false,
      errorCode: "UNSUPPORTED_ACCOUNT",
    });
    expect(result.accounts[0]!.positions).toHaveLength(1);
  });
});
