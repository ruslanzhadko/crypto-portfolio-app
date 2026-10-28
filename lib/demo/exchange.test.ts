import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_EXCHANGES,
  DemoExchangeAdapter,
  resetDemoMarkets,
} from "./exchange";

const index = [
  {
    symbol: "BTCUSDT",
    markPrice: "100000",
    lastFundingRate: "0.0001",
    nextFundingTime: 1_900_000_000_000,
  },
  { symbol: "ETHUSDT", markPrice: "4000" },
  { symbol: "SOLUSDT", markPrice: "200" },
  { symbol: "BNBUSDT", markPrice: "1000" },
];
const fetchIndex = vi.fn(async () => new Response(JSON.stringify(index)));
const rates = async () => new Map([["USDT", "1"]]);

afterEach(() => {
  resetDemoMarkets();
  fetchIndex.mockClear();
});

describe("DemoExchangeAdapter", () => {
  it("values the sample Binance accounts at live marks with consistent positions", async () => {
    const adapter = new DemoExchangeAdapter(
      "binance",
      rates,
      fetchIndex as unknown as typeof fetch,
      () => 1_800_000_000_000,
    );
    expect(await adapter.verify()).toEqual({
      externalAccountId: "demo-binance",
    });
    const { accounts, failedAccounts } = await adapter.fetch();
    expect(failedAccounts).toEqual([]);
    const spot = accounts.find((a) => a.accountKey === "spot")!;
    expect(spot.balances.find((b) => b.symbol === "BTC")).toMatchObject({
      priceUsd: "100000",
      usdValue: "15000",
    });
    const futures = accounts.find((a) => a.accountKey === "futures")!;
    const btc = futures.positions!.find((p) => p.symbol === "BTCUSDT")!;
    expect(btc).toMatchObject({
      side: "long",
      markPrice: "100000",
      leverage: "10",
      settle: "USDT",
    });
    const entry = Number(btc.entryPrice);
    // PnL, liquidation and break-even follow from entry, mark and size.
    expect(Number(btc.unrealizedPnl)).toBeCloseTo((100000 - entry) * 0.04, 2);
    expect(Math.abs(entry / 100000 - 1)).toBeLessThan(0.04);
    expect(Number(btc.liquidationPrice)).toBeLessThan(entry);
    expect(btc.funding).toMatchObject({
      status: "complete",
      nextRate: "0.0001",
    });
    expect(Number(btc.funding!.breakEvenPrice)).toBeGreaterThan(0);
    // SOL short: liquidation above entry.
    const sol = futures.positions!.find((p) => p.symbol === "SOLUSDT")!;
    expect(Number(sol.liquidationPrice)).toBeGreaterThan(
      Number(sol.entryPrice),
    );
  });

  it("asks the public index at most once per 15 seconds and has data for each demo exchange", async () => {
    const adapter = new DemoExchangeAdapter(
      "binance",
      rates,
      fetchIndex as unknown as typeof fetch,
    );
    await adapter.fetch();
    await adapter.fetch();
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    expect(Object.keys(DEMO_EXCHANGES).sort()).toEqual([
      "binance",
      "bybit",
      "okx",
    ]);
  });
});
