import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("./transport", () => ({
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
    expect(result.failedAccounts).toEqual([
      { accountKey: "spot", kind: "spot", errorCode: "SPOT_UNAVAILABLE" },
    ]);
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
});
