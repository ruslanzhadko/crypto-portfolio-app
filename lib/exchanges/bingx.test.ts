import { describe, expect, it, vi } from "vitest";
import { BingxAdapter, bingxData } from "./bingx";
import { bingx } from "ccxt";
const key = {
  enableReading: true,
  enableWithdrawals: false,
  enableSpotAndMarginTrading: false,
  enableFutures: false,
  enableInternalTransfer: false,
  permitsUniversalTransfer: false,
  enableVanillaOptions: false,
  ipRestrict: true,
};
const next = Date.now() + 3600000;
function fixture() {
  const data: Record<string, unknown> = {
    "account/apiPermissions": key,
    uid: { uid: "123456789012345678" },
    "account/balance": {
      balances: [
        { asset: "BTC", free: "0.1", locked: "0.02" },
        { asset: "USDT", free: "10", locked: "0" },
      ],
    },
    "ticker/price": [{ symbol: "BTC-USDT", price: "70000" }],
    "user/balance": [
      {
        asset: "USDT",
        balance: "100",
        equity: "110",
        unrealizedProfit: "10",
        availableMargin: "50",
      },
    ],
    "user/positions": [
      {
        positionId: "123456789012345678",
        symbol: "BTC-USDT",
        currency: "USDT",
        positionAmt: "0.01",
        positionSide: "SHORT",
        isolated: false,
        avgPrice: "70000",
        initialMargin: "70",
        liquidationPrice: "80000",
        leverage: "10",
        unrealizedProfit: "10",
      },
    ],
    "quote/premiumIndex": [
      {
        symbol: "BTC-USDT",
        markPrice: "69000",
        lastFundingRate: "-0.0001",
        nextFundingTime: next,
      },
    ],
  };
  const request = vi.fn(async (path: string) => ({
    code: 0,
    data: data[path],
  }));
  const adapter = new BingxAdapter(
    request,
    async () => new Map([["USDT", "0.99"]]),
  );
  return { data, request, adapter };
}
describe("BingX spot and perpetuals", () => {
  it("uses documented CCXT signing routes with GET and never sends passphrases", () => {
    const client = new bingx({
      apiKey: "fixture-key",
      secret: "fixture-secret",
    });
    for (const [path, api, suffix] of [
      [
        "account/apiPermissions",
        ["account", "v1", "private"],
        "/openApi/v1/account/apiPermissions",
      ],
      ["uid", ["account", "v1", "private"], "/openApi/account/v1/uid"],
      [
        "user/balance",
        ["swap", "v3", "private"],
        "/openApi/swap/v3/user/balance",
      ],
    ] as const) {
      const signed = client.sign(path, [...api], "GET", {});
      expect(signed.url).toContain(suffix + "?");
      expect(signed.url).toContain("signature=");
      expect(signed.headers?.["X-BX-APIKEY"]).toBe("fixture-key");
      expect(signed.method).toBe("GET");
      expect(signed.body).toBeUndefined();
    }
  });
  it("checks read-only permissions and binds to an exact UID", async () => {
    const { adapter } = fixture();
    expect(await adapter.verify()).toEqual({
      externalAccountId: "123456789012345678",
    });
    for (const changed of [
      { enableFutures: true },
      { enableWithdrawals: true },
      { enableInternalTransfer: true },
      { ipRestrict: false },
    ]) {
      const f = fixture();
      f.data["account/apiPermissions"] = { ...key, ...changed };
      await expect(f.adapter.verify()).rejects.toBeTruthy();
    }
  });
  it("values separate pools exactly once and normalizes short position size and next funding", async () => {
    const { adapter } = fixture();
    await adapter.verify();
    const result = await adapter.fetch(true);
    expect(result.failedAccounts).toEqual([]);
    expect(result.accounts.map((a) => a.equityUsd)).toEqual([
      "8325.9",
      "108.9",
    ]);
    expect(result.accounts[1]!.balances[0]!.usdValue).toBe("99");
    expect(result.accounts[1]!.positions![0]).toMatchObject({
      side: "short",
      baseSize: "0.01",
      contractSize: "1",
      notionalUsd: "683.1",
      markPrice: "69000",
      liquidationPrice: "80000",
      unrealizedPnlUsd: "9.9",
      funding: {
        amount: null,
        tradingFees: null,
        nextRate: "-0.0001",
        nextTime: next,
      },
    });
  });
  it("preserves successful spot when futures fail and does not declare positions empty", async () => {
    const f = fixture();
    await f.adapter.verify();
    delete f.data["user/positions"];
    const result = await f.adapter.fetch(true);
    expect(result.accounts.map((a) => a.kind)).toEqual(["spot"]);
    expect(result.failedAccounts).toEqual([
      {
        accountKey: "futures:usdt",
        kind: "futures",
        errorCode: "INVALID_RESPONSE",
      },
    ]);
  });
  it("keeps futures when spot fails and skips spot on frequent position refresh", async () => {
    const f = fixture();
    await f.adapter.verify();
    delete f.data["account/balance"];
    expect((await f.adapter.fetch(true)).accounts.map((a) => a.kind)).toEqual([
      "futures",
    ]);
    f.request.mockClear();
    await f.adapter.fetch(false);
    expect(f.request.mock.calls.map((call) => call[0])).not.toContain(
      "account/balance",
    );
  });
  it("marks unknown spot prices as incomplete and rejects inverse positions", async () => {
    const f = fixture();
    await f.adapter.verify();
    f.data["account/balance"] = {
      balances: [{ asset: "UNKNOWN", free: "1", locked: "0" }],
    };
    expect((await f.adapter.fetch(true)).accounts[0]).toMatchObject({
      complete: false,
      errorCode: "UNPRICED_ASSETS",
    });
    f.data["user/positions"] = [{ positionAmt: "1", symbol: "BTC-USD" }];
    expect((await f.adapter.fetch(false)).failedAccounts[0]?.errorCode).toBe(
      "UNSUPPORTED_ACCOUNT",
    );
  });
  it("maps API errors without exposing provider messages", () => {
    for (const [code, expected] of [
      [100419, "IP_RESTRICTED"],
      [100410, "RATE_LIMIT"],
      [100413, "INVALID_KEY"],
      [100500, "UNAVAILABLE"],
    ]) {
      try {
        bingxData({ code, msg: "secret" });
      } catch (error) {
        expect(error).toMatchObject({ code: expected, message: expected });
      }
    }
  });
});
