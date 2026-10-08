import { afterEach, describe, expect, it, vi } from "vitest";
import { GateAdapter } from "./gate";
import { OkxAdapter } from "./okx";
import { assertGateReadOnly } from "./provider-utils";
import type { Request } from "./transport";

const prices = async () =>
  new Map([
    ["USDT", "0.99"],
    ["USDC", "1"],
  ]);
const key = "gate-test-key-123456789";
const keyInfo = {
  key,
  state: 1,
  perms: [
    { name: "spot", read_only: true },
    { name: "futures", read_only: true },
  ],
  ip_whitelist: ["203.0.113.10"],
};
function gateFixture() {
  const data: Record<string, unknown> = {
    "private:account/detail": { user_id: 123, ip_whitelist: ["203.0.113.10"] },
    "private:account/main_keys": [keyInfo],
    "private:unified/unified_mode": { mode: "classic" },
    "private:spot/accounts": [
      { currency: "USDT", available: "10", locked: "0" },
      { currency: "BTC", available: "0.001", locked: "0.001" },
    ],
    "public:spot/tickers": [{ currency_pair: "BTC_USDT", last: "50000" }],
    "public:futures/usdt/contracts": [
      {
        name: "BTC_USDT",
        type: "direct",
        quanto_multiplier: "0.0001",
        funding_rate: "0.0001",
        funding_next_apply: Math.floor(Date.now() / 1000) + 3600,
      },
    ],
    "private:futures/usdt/accounts": {
      currency: "USDT",
      total: "1000",
      available: "800",
      unrealised_pnl: "-10",
    },
    "private:futures/usdt/positions": [
      {
        contract: "BTC_USDT",
        mode: "single",
        size: "-100",
        leverage: "0",
        cross_leverage_limit: "5",
        entry_price: "50000",
        mark_price: "51000",
        liq_price: "60000",
        initial_margin: "100",
        unrealised_pnl: "-10",
        pnl_fund: "2",
        pnl_pnl: "3",
        pnl_fee: "-1",
        realised_point: "0",
        open_time: "1700000000",
      },
    ],
  };
  const request = vi.fn<Request>(async (path, api) => {
    const value = data[`${api}/${path}`];
    if (value instanceof Error) throw value;
    if (value === undefined)
      throw new Error(`Unexpected request ${api}/${path}`);
    return structuredClone(value);
  });
  return { data, request, adapter: new GateAdapter(request, prices, key) };
}
function okxFixture() {
  const data: Record<string, unknown> = {
    "account/config": [
      { uid: "42", acctLv: "2", perm: "read_only", ip: "203.0.113.10" },
    ],
    "public/instruments": [
      {
        instId: "BTC-USDT-SWAP",
        ctType: "linear",
        ctVal: "0.01",
        ctValCcy: "BTC",
        settleCcy: "USDT",
      },
    ],
    "account/balance": [
      {
        totalEq: "990",
        details: [
          {
            ccy: "USDT",
            cashBal: "1010",
            eq: "1000",
            eqUsd: "990",
            availBal: "800",
            frozenBal: "0",
            liab: "0",
          },
        ],
      },
    ],
    "account/positions": [
      {
        instId: "BTC-USDT-SWAP",
        instType: "SWAP",
        posId: "99",
        pos: "-2",
        posSide: "net",
        mgnMode: "cross",
        avgPx: "50000",
        markPx: "50500",
        liqPx: "60000",
        lever: "5",
        imr: "200",
        upl: "-10",
        fundingFee: "2",
        pnl: "3",
        fee: "-1",
        cTime: "1700000000000",
        liqPenalty: "0",
        settledPnl: "0",
      },
    ],
    "public/funding-rate": [
      {
        fundingRate: "0.0002",
        fundingTime: String(Date.now() + 3600000),
        nextFundingTime: String(Date.now() + 7200000),
      },
    ],
  };
  const request = vi.fn<Request>(async (path) => {
    const value = data[path];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error(`Unexpected request ${path}`);
    return { code: "0", data: structuredClone(value) };
  });
  return { data, request, adapter: new OkxAdapter(request, prices) };
}
const row = (data: Record<string, unknown>, name: string) =>
  (data[name] as Record<string, unknown>[])[0]!;
afterEach(() => vi.useRealTimers());

describe("Gate classic", () => {
  it("accepts evolved classic and the replacement leverage/margin fields", async () => {
    const { data, adapter } = gateFixture();
    Object.assign(data["private:futures/usdt/accounts"] as object, {
      enable_evolved_classic: true,
    });
    Object.assign(row(data, "private:futures/usdt/positions"), {
      leverage: undefined,
      cross_leverage_limit: undefined,
      lever: "7",
      pos_margin_mode: "cross",
    });
    await adapter.verify();
    expect(
      (await adapter.fetch(false)).accounts[0]!.positions![0],
    ).toMatchObject({ leverage: "7", marginMode: "cross" });
  });
  it("keeps wallets separate, applies contract size and cash flow signs without counting PnL twice", async () => {
    const { adapter } = gateFixture();
    expect(await adapter.verify()).toEqual({ externalAccountId: "123" });
    const r = await adapter.fetch(true);
    expect(r.failedAccounts).toEqual([]);
    expect(r.accounts[0]).toMatchObject({
      accountKey: "spot",
      equityUsd: "108.9",
      availableUsd: "59.4",
      complete: true,
    });
    expect(r.accounts[1]).toMatchObject({
      accountKey: "futures:usdt",
      equityUsd: "980.1",
      unrealizedPnlUsd: "-9.9",
    });
    expect(r.accounts[1]!.positions![0]).toMatchObject({
      contracts: "100",
      contractSize: "0.0001",
      baseSize: "0.01",
      notionalUsd: "504.9",
      side: "short",
      leverage: "5",
      marginMode: "cross",
      funding: {
        amount: "2",
        realizedPnl: "3",
        tradingFees: "1",
        breakEvenPrice: "50400",
        status: "complete",
      },
    });
  });
  it("preserves unknown prices and skips spot work for position-only polls", async () => {
    const { data, adapter, request } = gateFixture();
    (data["private:spot/accounts"] as unknown[]).push({
      currency: "UNKNOWN",
      available: "2",
      locked: "0",
    });
    await adapter.verify();
    expect((await adapter.fetch(true)).accounts[0]).toMatchObject({
      complete: false,
      availableUsd: null,
      errorCode: "UNPRICED_ASSETS",
    });
    request.mockClear();
    await adapter.fetch(false);
    expect(request.mock.calls.some(([, api]) => api.includes("spot"))).toBe(
      false,
    );
    expect(request.mock.calls.some(([path]) => path === "usdt/contracts")).toBe(
      false,
    );
  });
  it("a futures failure does not discard valid spot balances", async () => {
    const { data, adapter } = gateFixture();
    data["private:futures/usdt/accounts"] = new Error(
      "private provider message",
    );
    await adapter.verify();
    const result = await adapter.fetch(true);
    expect(result.accounts.map((a) => a.accountKey)).toEqual(["spot"]);
    expect(result.failedAccounts).toEqual([
      { accountKey: "futures:usdt", kind: "futures", errorCode: "UNAVAILABLE" },
    ]);
  });
  it("rejects repeated pagination instead of publishing truncated positions", async () => {
    const { data, adapter } = gateFixture();
    const p = row(data, "private:futures/usdt/positions");
    data["private:futures/usdt/positions"] = Array.from(
      { length: 100 },
      (_, i) => ({ ...p, contract: `COIN${i}_USDT` }),
    );
    await adapter.verify();
    expect((await adapter.fetch(false)).failedAccounts[0]?.errorCode).toBe(
      "INVALID_RESPONSE",
    );
  });
  it("does not invent fees or breakeven for POINT-paid fees", async () => {
    const { data, adapter } = gateFixture();
    row(data, "private:futures/usdt/positions").realised_point = "5";
    await adapter.verify();
    expect(
      (await adapter.fetch(false)).accounts[0]!.positions![0]!.funding,
    ).toMatchObject({ amount: "2", tradingFees: null, breakEvenPrice: null });
  });
  it("rejects unified accounts and keys with trading rights", async () => {
    const { data, adapter } = gateFixture();
    data["private:unified/unified_mode"] = { mode: "multi_currency" };
    await expect(adapter.verify()).rejects.toThrow("UNSUPPORTED_ACCOUNT");
    expect(() =>
      assertGateReadOnly(
        [{ ...keyInfo, perms: [{ name: "futures", read_only: false }] }],
        key,
      ),
    ).toThrow("UNSAFE_KEY");
    expect(() =>
      assertGateReadOnly([{ ...keyInfo, ip_whitelist: [] }], key),
    ).toThrow("IP_RESTRICTED");
  });
  it("only trusts a uniquely matched current key, including masked prefixes", () => {
    const masked = { ...keyInfo, key: "gate-test-key*****" };
    expect(() => assertGateReadOnly([masked], key)).not.toThrow();
    expect(() => assertGateReadOnly([masked, masked], key)).toThrow(
      "INVALID_RESPONSE",
    );
    expect(() =>
      assertGateReadOnly([{ ...keyInfo, key: "other-key" }], key),
    ).toThrow("INVALID_RESPONSE");
  });
});

describe("global OKX", () => {
  it("uses authoritative equity once, converts contracts and keeps native fees/funding", async () => {
    const { adapter, data } = okxFixture();
    expect(await adapter.verify()).toEqual({ externalAccountId: "42" });
    const r = await adapter.fetch();
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0]).toMatchObject({
      equityUsd: "990",
      unrealizedPnlUsd: "-9.9",
      complete: true,
    });
    expect(r.accounts[0]!.positions![0]).toMatchObject({
      base: "BTC",
      contracts: "2",
      baseSize: "0.02",
      notionalUsd: "999.9",
      side: "short",
      funding: {
        amount: "2",
        realizedPnl: "3",
        tradingFees: "1",
        breakEvenPrice: "50200",
        nextRate: "0.0002",
        nextTime: Number(row(data, "public/funding-rate").fundingTime),
      },
    });
  });
  it.each(["long", "short"])(
    "handles hedge %s quantities without relying on their sign",
    async (side) => {
      const { data, adapter } = okxFixture();
      Object.assign(row(data, "account/positions"), {
        pos: "2",
        posSide: side,
      });
      await adapter.verify();
      expect((await adapter.fetch()).accounts[0]!.positions![0]!.side).toBe(
        side,
      );
    },
  );
  it("keeps absent native funding and fee data unknown", async () => {
    const { data, adapter } = okxFixture();
    Object.assign(row(data, "account/positions"), { fundingFee: "", fee: "" });
    await adapter.verify();
    expect(
      (await adapter.fetch()).accounts[0]!.positions![0]!.funding,
    ).toMatchObject({
      amount: null,
      tradingFees: null,
      breakEvenPrice: null,
      status: "unavailable",
    });
  });
  it("does not replace unknown USD PnL with zero", async () => {
    const { request } = okxFixture();
    const adapter = new OkxAdapter(request, async () => new Map());
    await adapter.verify();
    expect((await adapter.fetch()).accounts[0]).toMatchObject({
      equityUsd: "990",
      unrealizedPnlUsd: null,
      complete: false,
    });
  });
  it("refuses unsupported exposure in the same equity pool", async () => {
    const { data, adapter } = okxFixture();
    row(data, "account/positions").instType = "OPTION";
    await adapter.verify();
    await expect(adapter.fetch()).rejects.toThrow("UNSUPPORTED_ACCOUNT");
  });
  it.each([{ perm: "read_only,trade" }, { ip: "" }, { acctLv: "4" }])(
    "refuses unsafe or unsupported configuration %j",
    async (override) => {
      const { data, adapter } = okxFixture();
      Object.assign(row(data, "account/config"), override);
      await expect(adapter.verify()).rejects.toThrow();
    },
  );
  it("backs off optional market funding failures while still refreshing balances", async () => {
    const { data, adapter, request } = okxFixture();
    data["public/funding-rate"] = new Error("upstream unavailable");
    await adapter.verify();
    const r = await adapter.fetch();
    expect(r.accounts[0]!.positions![0]!.funding).toMatchObject({
      amount: "2",
      nextRate: null,
      nextTime: null,
    });
    await adapter.fetch();
    expect(
      request.mock.calls.filter(([p]) => p === "public/funding-rate"),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([p]) => p === "account/balance"),
    ).toHaveLength(2);
  });
});
