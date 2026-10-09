import { describe, expect, it, vi } from "vitest";
import { bitget } from "ccxt";
import { BitgetAdapter, bitgetData } from "./bitget";

const pos = {
  symbol: "BTCUSDT",
  marginCoin: "USDT",
  total: "2",
  holdSide: "long",
  posSide: "long",
  marginMode: "crossed",
  marginSize: "20",
  positionBalance: "20",
  leverage: "10",
  openPriceAvg: "100",
  avgPrice: "100",
  markPrice: "110",
  unrealizedPL: "20",
  unrealisedPnl: "20",
  achievedProfits: "5",
  curRealisedPnl: "5",
  totalFee: "-2",
  deductedFee: "1",
  totalFunding: "-2",
  openFeeTotal: "-0.6",
  closeFeeTotal: "-0.4",
  liquidationPrice: "60",
  cashDividend: "0",
  cTime: "1700000000000",
  createdTime: "1700000000000",
  category: "USDT-FUTURES",
};
function fixture(mode = "hybrid") {
  const state = {
    mode,
    fail: "",
    error: "",
    info: { userId: "123456", permType: "read-only", ips: "203.0.113.10" },
    legacyInfo: {
      userId: "123456",
      authorities: ["stor", "cpor", "coor"],
      ips: "203.0.113.10",
    },
    position: { ...pos },
    spot: [{ coin: "usdt", available: "70", frozen: "20", locked: "10" }],
    assets: [
      {
        coin: "USDT",
        equity: "120",
        usdValue: "120",
        balance: "100",
        available: "80",
        locked: "20",
        debt: "0",
      },
    ],
  };
  const request = vi.fn(
    async (path: string, api: string, params: Record<string, unknown> = {}) => {
      if (state.fail === path) throw new Error("signed-secret-do-not-expose");
      if (state.error && path === "v3/account/settings")
        return { code: state.error, data: null };
      let data: unknown;
      switch (path) {
        case "v3/account/info":
          data = state.info;
          break;
        case "v2/spot/account/info":
          data = state.legacyInfo;
          break;
        case "v3/account/settings":
          data = {
            uid: "123456",
            accountMode: state.mode,
            accountLevel: "basic",
          };
          break;
        case "v2/spot/market/tickers":
          data = [];
          break;
        case "v2/spot/account/assets":
          data = state.spot;
          break;
        case "v3/account/assets":
          data = {
            accountEquity: "120",
            unrealisedPnl: "20",
            assets: state.assets,
          };
          break;
        case "v2/mix/account/accounts":
          data =
            params.productType === "USDT-FUTURES"
              ? [
                  {
                    marginCoin: "USDT",
                    available: "80",
                    locked: "20",
                    accountEquity: "120",
                    usdtEquity: "120",
                    unrealizedPL: "20",
                    assetMode: "single",
                  },
                ]
              : [];
          break;
        case "v2/mix/position/all-position":
          data = params.productType === "USDT-FUTURES" ? [state.position] : [];
          break;
        case "v3/position/current-position":
          data = {
            list: params.category === "USDT-FUTURES" ? [state.position] : [],
          };
          break;
        case "v3/market/current-fund-rate":
          data = [
            {
              symbol: "BTCUSDT",
              fundingRate: "0.0001",
              nextUpdate: String(Date.now() + 3600000),
            },
          ];
          break;
        default:
          throw new Error(`Unexpected request ${api}:${path}`);
      }
      return { code: "00000", data };
    },
  );
  const adapter = new BitgetAdapter(
    request,
    async () =>
      new Map([
        ["USDT", "1"],
        ["USDC", "1"],
      ]),
  );
  return { state, request, adapter };
}
describe("Bitget Classic and Unified accounts", () => {
  it("signs v2 and v3 read requests with the passphrase using the pinned CCXT client", () => {
    const client = new bitget({
      apiKey: "fixture-key",
      secret: "fixture-secret",
      password: "fixture-passphrase",
    });
    for (const [path, api] of [
      ["v3/account/settings", ["private", "uta"]],
      ["v2/spot/account/assets", ["private", "spot"]],
      ["v2/mix/position/all-position", ["private", "mix"]],
    ] as const) {
      const signed = client.sign(path, [...api], "GET", {});
      expect(signed.url).toBe(`https://api.bitget.com/api/${path}`);
      expect(signed.headers?.["ACCESS-PASSPHRASE"]).toBe("fixture-passphrase");
      expect(signed.headers?.["ACCESS-SIGN"]).toBeTruthy();
      expect(signed.method).toBe("GET");
    }
  });
  it("keeps classic spot/futures cash separate and does not add unrealized PnL twice", async () => {
    const { adapter } = fixture();
    expect(await adapter.verify()).toEqual({ externalAccountId: "123456" });
    const result = await adapter.fetch(true);
    expect(result.failedAccounts).toEqual([]);
    expect(result.accounts[0]!.equityUsd).toBe("100");
    const f = result.accounts[1]!;
    expect(f.equityUsd).toBe("120");
    expect(f.balances[0]!.total).toBe("100");
    expect(f.positions![0]!.funding).toMatchObject({
      amount: "-2",
      tradingFees: "1",
      realizedPnl: "5",
      breakEvenPrice: "99",
      nextRate: "0.0001",
    });
  });
  it("uses exactly one native equity pool for Unified, with spot holdings and all positions", async () => {
    const { adapter, request } = fixture("unified");
    await adapter.verify();
    const { accounts } = await adapter.fetch(false);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      kind: "unified",
      accountKey: "unified",
      equityUsd: "120",
      unrealizedPnlUsd: "20",
    });
    expect(accounts[0]!.balances[0]!.total).toBe("100");
    expect(accounts[0]!.positions![0]!.funding?.tradingFees).toBe("1");
    expect(
      request.mock.calls.some(
        ([path]) =>
          path.startsWith("v2/mix") || path === "v2/spot/account/assets",
      ),
    ).toBe(false);
    expect(
      request.mock.calls.filter(
        ([path]) => path === "v3/position/current-position",
      ),
    ).toHaveLength(3);
  });
  it("accepts only a documented not-Unified response for Classic fallback", async () => {
    const { adapter, state } = fixture();
    state.error = "25245";
    await adapter.verify();
    expect((await adapter.fetch(true)).accounts[0]!.kind).toBe("spot");
    state.legacyInfo.authorities.push("stow");
    await expect(adapter.verify()).rejects.toMatchObject({
      code: "UNSAFE_KEY",
    });
  });
  it.each(["429", "25000", "25620"])(
    "does not treat %s as evidence of a Classic account",
    async (error) => {
      const { adapter, state, request } = fixture();
      state.error = error;
      await expect(adapter.verify()).rejects.toThrow();
      expect(
        request.mock.calls.some(([p]) => p === "v2/spot/account/info"),
      ).toBe(false);
    },
  );
  it("rejects write access, missing whitelist and transitional account modes", async () => {
    for (const change of [
      (s: ReturnType<typeof fixture>["state"]) => {
        s.info.permType = "read-and-write";
      },
      (s: ReturnType<typeof fixture>["state"]) => {
        s.info.ips = "0.0.0.0/0";
      },
      (s: ReturnType<typeof fixture>["state"]) => {
        s.mode = "upgrading";
      },
    ]) {
      const { adapter, state } = fixture();
      change(state);
      await expect(adapter.verify()).rejects.toThrow();
    }
  });
  it("forces a full Classic snapshot after a mode change and refuses to mix partial pools", async () => {
    const { adapter, state, request } = fixture("unified");
    await adapter.verify();
    await adapter.fetch(true);
    state.mode = "hybrid";
    state.fail = "v2/spot/account/assets";
    await adapter.verify();
    await expect(adapter.fetch(false)).rejects.toThrow();
    state.fail = "";
    request.mockClear();
    const result = await adapter.fetch(false);
    expect(result.accounts[0]!.kind).toBe("spot");
    request.mockClear();
    await adapter.fetch(false);
    expect(
      request.mock.calls.some(([p]) => p === "v2/spot/account/assets"),
    ).toBe(false);
  });
  it("preserves verified sections on a same-mode outage, and rejects partial Unified exposure", async () => {
    const { adapter, state } = fixture();
    await adapter.verify();
    await adapter.fetch(true);
    state.fail = "v2/spot/account/assets";
    const result = await adapter.fetch(true);
    expect(result.failedAccounts).toEqual([
      { accountKey: "spot", kind: "spot", errorCode: "UNAVAILABLE" },
    ]);
    expect(result.accounts[0]!.positions).toHaveLength(1);
    state.mode = "unified";
    state.fail = "v3/position/current-position";
    await adapter.verify();
    await expect(adapter.fetch(true)).rejects.toThrow();
  });
  it("keeps zero funding, absent commissions and negative cash distinct", async () => {
    const { adapter, state } = fixture();
    state.position.totalFee = "";
    state.position.deductedFee = "";
    await adapter.verify();
    const result = await adapter.fetch(true);
    expect(result.accounts[1]!.positions![0]!.funding).toMatchObject({
      amount: "0",
      tradingFees: null,
      breakEvenPrice: null,
    });
  });
  it("rejects malformed or duplicated positions and does not leak response messages", async () => {
    const { adapter, state } = fixture();
    state.position.holdSide = "unknown";
    await adapter.verify();
    await expect(adapter.fetch(true)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(() => bitgetData({ code: "40009", msg: "signed-secret" })).toThrow(
      "INVALID_KEY",
    );
  });
});
