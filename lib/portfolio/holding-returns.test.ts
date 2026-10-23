import { describe, expect, it } from "vitest";
import {
  appendHoldings,
  appendPrices,
  computeReturns,
  moverChange,
  withLiveTail,
  WINDOW_SLOTS,
  type HoldingSeries,
  type PriceSeries,
} from "./holding-returns";

const T0 = 1_000_000;

interface Step {
  slot: number;
  price: number;
  wallet: number;
  exchange?: number;
}

/** Runs the updater over the steps for one coin "c" and returns the final result. */
function simulate(steps: Step[]) {
  let prices: PriceSeries | null = null;
  let holdings: HoldingSeries | null = null;
  for (const s of steps) {
    const current = new Map<string, { wallet: number; exchange: number }>();
    const held = s.wallet + (s.exchange ?? 0) > 0;
    if (held) current.set("c", { wallet: s.wallet, exchange: s.exchange ?? 0 });
    holdings = appendHoldings(holdings, s.slot, current);
    // Like the updater: prices come only with current holdings.
    const now = new Map(held ? [["c", s.price]] : []);
    prices = appendPrices(prices, s.slot, now, new Set(Object.keys(holdings.q)));
  }
  return { prices: prices!, holdings: holdings!, ...computeReturns(prices!, holdings!) };
}

const day = (fn: (i: number) => Omit<Step, "slot">) =>
  Array.from({ length: WINDOW_SLOTS + 1 }, (_, i) => ({ slot: T0 + i, ...fn(i) }));

describe("holding returns", () => {
  it("an unchanged position earns the price change of the day", () => {
    const { result, steady } = simulate(day((i) => ({ price: 100 + (10 * i) / WINDOW_SLOTS, wallet: 10 })));
    const [usd, pct, hours] = result.all.c!;
    expect(usd).toBeCloseTo(100, 6);
    expect(pct).toBeCloseTo(10, 6);
    expect(hours).toBe(24);
    expect(steady.get("c")).toBeCloseTo(10, 6);
  });

  it("a buy inside the day counts the new coins only from the buy", () => {
    // 1 coin while the price halves, then 3 coins while it goes 50 → 60.
    const { result, steady } = simulate(
      day((i) => ({ price: i <= 24 ? 100 - (50 * i) / 24 : 50 + (10 * (i - 24)) / 24, wallet: i < 24 ? 1 : 3 })),
    );
    const [usd, pct] = result.all.c!;
    expect(usd).toBeCloseTo(-50 + 30, 6);
    expect(pct).toBeCloseTo(-40, 6);
    expect(steady.has("c")).toBe(false);
  });

  it("a position opened 18h ago shows the return since the purchase", () => {
    // Before slot 12 the coin was not held; its price crashed 92% then.
    const { result } = simulate(
      day((i) => ({ price: i < 12 ? 25 - i * 2 : 2 - ((i - 12) * 0.1) / 36, wallet: i < 12 ? 0 : 10 })),
    );
    const [usd, pct, hours] = result.all.c!;
    expect(usd).toBeCloseTo(-1, 6);
    expect(pct).toBeCloseTo(-5, 6);
    expect(hours).toBe(18);
  });

  it("a partial sale keeps the sold coins' result until the sale", () => {
    const { result } = simulate(day((i) => ({ price: 100 + (100 * i) / 48, wallet: i < 24 ? 10 : 5 })));
    const [usd, pct] = result.all.c!;
    expect(usd).toBeCloseTo(10 * 50 + 5 * 50, 6);
    expect(pct).toBeCloseTo(100, 6);
  });

  it("a fully sold coin is not a mover and is dropped after a day", () => {
    const steps = day((i) => ({ price: 100, wallet: i < 30 ? 1 : 0 }));
    expect(simulate(steps).result.all.c).toBeUndefined();
    const later = [...steps, ...day(() => ({ price: 100, wallet: 0 })).map((s) => ({ ...s, slot: s.slot + 49 }))];
    const { holdings, prices } = simulate(later);
    expect(holdings.q.c).toBeUndefined();
    expect(prices.p.c).toBeUndefined();
  });

  it("a zero position is not stored", () => {
    const { holdings, result } = simulate([{ slot: T0, price: 5, wallet: 0 }]);
    expect(holdings.q).toEqual({});
    expect(result.all).toEqual({});
  });

  it("a missed snapshot stretches the segment instead of breaking the result", () => {
    const steps = day((i) => ({ price: 100 + i, wallet: 2 })).filter((s) => s.slot < T0 + 10 || s.slot > T0 + 13);
    const { result } = simulate(steps);
    const [usd, pct, hours] = result.all.c!;
    expect(usd).toBeCloseTo(2 * 48, 6);
    expect(pct).toBeCloseTo(48, 6);
    expect(hours).toBe(24);
  });

  it("the first day covers only the slots recorded so far", () => {
    const { result, steady } = simulate(day((i) => ({ price: 10 + i, wallet: 1 })).slice(28));
    const [, pct, hours] = result.all.c!;
    expect(hours).toBe(10);
    expect(pct).toBeCloseTo((58 / 38 - 1) * 100, 3);
    expect(result.from).toBe(T0 + 28);
    expect(steady.size).toBe(0);
  });

  it("a second run in the same slot replaces that slot", () => {
    const steps = [
      { slot: T0, price: 10, wallet: 1 },
      { slot: T0 + 1, price: 11, wallet: 1 },
      { slot: T0 + 1, price: 12, wallet: 2 },
    ];
    const { result, prices, holdings } = simulate(steps);
    expect(prices.slots).toEqual([T0, T0 + 1]);
    expect(holdings.q.c).toEqual([T0, 1, 0, T0 + 1, 2, 0]);
    expect(result.all.c![0]).toBeCloseTo(2, 6);
  });

  it("keeps a separate wallet-only result for coins also held on an exchange", () => {
    const { result } = simulate(day((i) => ({ price: 1 + i / 48, wallet: 10, exchange: i < 24 ? 0 : 30 })));
    expect(result.all.c![0]).toBeCloseTo(10 * 1 + 30 * 0.5, 6);
    expect(result.w.c![0]).toBeCloseTo(10, 6);
    expect(result.w.c![1]).toBeCloseTo(100, 6);
  });

  it("extends the stored result to the live price", () => {
    expect(withLiveTail([10, 10, 24, 110], 121, 2)).toEqual({ usd: 10 + 2 * 11, percent: expect.closeTo(21, 6), hours: 24 });
    expect(withLiveTail([10, null, 0, 50], 55, 1).percent).toBeCloseTo(10, 6);
    expect(withLiveTail([10, 5, 3, 50], 0, 1)).toEqual({ usd: 10, percent: 5, hours: 3 });
  });
});

describe("moverChange", () => {
  const tok = { key: "c", totalBalance: 2, totalUsd: 242, currentPrice: 121, priceChange24h: 21 };
  const now = (T0 + 48) * 30 * 60 * 1000;
  const result = { v: 1 as const, at: T0 + 48, from: T0, all: { c: [10, 10, 24, 110] as [number, number, number, number] }, w: {} };

  it("uses the snapshot result extended to the live price", () => {
    expect(moverChange(tok, result, "all", now)).toEqual({ usd: 32, percent: expect.closeTo(21, 6), hours: 24 });
  });

  it("keeps the old estimate without snapshots, for unknown coins and for a stale result", () => {
    const estimate = { usd: expect.closeTo(242 - 242 / 1.21, 6), percent: 21, hours: null };
    expect(moverChange(tok, null, "all", now)).toEqual(estimate);
    expect(moverChange({ ...tok, key: "x" }, result, "all", now)).toEqual(estimate);
    expect(moverChange(tok, { ...result, from: T0 + 47 }, "all", now)).toEqual(estimate);
    expect(moverChange(tok, result, "all", now + 49 * 30 * 60 * 1000)).toEqual(estimate);
  });

  it("prefers the wallet-only result on the wallets tab", () => {
    const both = { ...result, w: { c: [1, 1, 24, 121] as [number, number, number, number] } };
    expect(moverChange(tok, both, "wallets", now).usd).toBe(1);
    expect(moverChange(tok, both, "all", now).usd).toBe(32);
  });
});
