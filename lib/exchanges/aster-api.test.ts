import { afterEach, describe, expect, it, vi } from "vitest";
import { aster } from "ccxt";
vi.mock("./rate-budget", () => ({ reserveRequest: vi.fn() }));
import { AsterApiAdapter, createAsterTransport } from "./aster-api";
const user = `0x${"a".repeat(40)}`;
const secret = "1".repeat(64),
  client = new aster({ privateKey: secret });
const signer = client.ethGetAddressFromPrivateKey(secret);
function fixture() {
  const agent = {
    agentAddress: signer,
    canRead: true,
    canSpotTrade: false,
    canPerpTrade: false,
    canWithdraw: false,
    expired: Date.now() + 86400000,
    ipWhitelist: "203.0.113.10",
  };
  const rows = ["ETHUSDT", "BTCUSDT"].map((symbol) => ({
    symbol,
    positionSide: "LONG",
    positionAmt: "1",
    entryPrice: "2000",
    markPrice: "2100",
    liquidationPrice: "1700",
    leverage: "10",
    marginType: "cross",
    unRealizedProfit: "100",
  }));
  const request = vi.fn(async (path: string) => {
    if (path === "v3/agent") return [agent];
    if (path === "v3/account")
      return {
        positions: rows.map((r) => ({ ...r, positionInitialMargin: "210" })),
        assets: [
          {
            asset: "USDT",
            walletBalance: "1000",
            marginBalance: "1200",
            availableBalance: "780",
            unrealizedProfit: "200",
          },
        ],
      };
    if (path === "v3/positionRisk") return rows;
    if (path === "v3/premiumIndex")
      return rows.map((r) => ({
        symbol: r.symbol,
        lastFundingRate: "0.0001",
        nextFundingTime: Date.now() + 3600000,
      }));
    throw new Error("History unavailable");
  });
  return {
    agent,
    request,
    adapter: new AsterApiAdapter(
      user,
      signer,
      request,
      async () => new Map([["USDT", "0.99"]]),
    ),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("Aster authenticated API Wallet", () => {
  it("checks separate signer identity and uses only allowlisted signed GET requests", async () => {
    const transport = createAsterTransport(user, { apiKey: signer, secret });
    const signed = client.sign("v3/account", "fapiPrivate", "GET", {
      user,
      signer,
    });
    expect(signed.url).toContain("/fapi/v3/account?");
    expect(signed.url).toContain(`user=${user}`);
    expect(signed.url).toContain("signature=");
    expect(signed.body).toBeUndefined();
    await expect(
      transport.request("v3/order", "fapiPrivate"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(() =>
      createAsterTransport(user, { apiKey: user, secret }),
    ).toThrow();
    expect(() =>
      createAsterTransport(user, { apiKey: `0x${"b".repeat(40)}`, secret }),
    ).toThrow();
    await transport.close();
  });
  it("requires verified read-only permissions, expiry and IP restriction", async () => {
    const f = fixture();
    expect(await f.adapter.verify()).toEqual({ externalAccountId: user });
    for (const key of [
      "canSpotTrade",
      "canPerpTrade",
      "canWithdraw",
    ] as const) {
      const f = fixture();
      f.agent[key] = true;
      await expect(f.adapter.verify()).rejects.toMatchObject({
        code: "UNSAFE_KEY",
      });
    }
    const invalid = fixture();
    invalid.agent.expired = NaN;
    await expect(invalid.adapter.verify()).rejects.toMatchObject({
      code: "INVALID_KEY",
    });
    const unbound = fixture();
    unbound.agent.ipWhitelist = "0.0.0.0/0";
    await expect(unbound.adapter.verify()).rejects.toMatchObject({
      code: "IP_RESTRICTED",
    });
  });
  it("reads every open position, liquidation, leverage and margin without double counting equity", async () => {
    const f = fixture();
    await f.adapter.verify();
    const result = await f.adapter.fetch();
    expect(result.accounts[0]).toMatchObject({
      accountKey: "futures",
      mode: "api-wallet",
      equityUsd: "1188",
      unrealizedPnlUsd: "198",
      complete: true,
    });
    expect(result.accounts[0]!.positions).toHaveLength(2);
    expect(result.accounts[0]!.positions![0]).toMatchObject({
      entryPrice: "2000",
      markPrice: "2100",
      liquidationPrice: "1700",
      leverage: "10",
      margin: "210",
      funding: { amount: null, nextRate: "0.0001" },
    });
    expect(result.failedAccounts).toEqual([]);
  });
  it("never forwards credentials in transport failures", async () => {
    vi.spyOn(aster.prototype, "request").mockRejectedValue(
      new Error("secret=private signed query"),
    );
    const transport = createAsterTransport(user, { apiKey: signer, secret });
    await expect(
      transport.request("v3/account", "fapiPrivate"),
    ).rejects.toMatchObject({ message: "UNAVAILABLE" });
    await transport.close();
  });
});
