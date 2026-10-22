import { describe, expect, it } from "vitest";
import { TriggerDirection, TriggerType } from "@prisma/client";
import { TriggerEngine, type EngineTrigger } from "./engine";

const MIN = 60_000;
const percent = (over: Partial<EngineTrigger> = {}): EngineTrigger => ({
  id: "p1",
  userId: "u1",
  tokenId: "bitcoin",
  tokenSymbol: "BTC",
  tokenName: "Bitcoin",
  triggerType: TriggerType.PERCENT,
  threshold: 5,
  targetPrice: null,
  direction: TriggerDirection.BOTH,
  interval: 15,
  lastPrice: null,
  ...over,
});
const target = (over: Partial<EngineTrigger> = {}): EngineTrigger =>
  percent({
    id: "t1",
    triggerType: TriggerType.PRICE_TARGET,
    threshold: 0,
    targetPrice: 110,
    direction: TriggerDirection.UP,
    interval: 1,
    lastPrice: 100,
    ...over,
  });
const prices = (price: number) => new Map([["bitcoin", price]]);

describe("TriggerEngine percent triggers", () => {
  it("fires as soon as the move within the interval reaches the threshold", () => {
    const engine = new TriggerEngine();
    engine.load([percent()]);
    expect(engine.check(prices(100), 0)).toEqual([]);
    expect(engine.check(prices(103), 2 * MIN)).toEqual([]);
    const [fired] = engine.check(prices(105.5), 4 * MIN);
    expect(fired?.kind).toBe("percent");
    expect(fired && "delta" in fired ? fired.delta : 0).toBeCloseTo(5.5);
  });

  it("measures only within the interval", () => {
    const engine = new TriggerEngine();
    engine.load([percent()]);
    engine.check(prices(100), 0);
    engine.check(prices(103), 10 * MIN);
    // 106 is +6% against 20 minutes ago, but only +2.9% against the start of the 15-minute window.
    expect(engine.check(prices(106), 20 * MIN)).toEqual([]);
  });

  it("reports one move once and measures again from the firing", () => {
    const engine = new TriggerEngine();
    engine.load([percent()]);
    engine.check(prices(100), 0);
    expect(engine.check(prices(106), MIN)).toHaveLength(1);
    expect(engine.check(prices(107), 2 * MIN)).toEqual([]);
    expect(engine.check(prices(112), 3 * MIN)).toHaveLength(1);
  });

  it("supports a one-minute period with checks every 20 seconds", () => {
    const engine = new TriggerEngine();
    engine.load([percent({ interval: 1, threshold: 1 })]);
    engine.check(prices(100), 0);
    engine.check(prices(100.5), 20_000);
    // +1.5% against two minutes ago, but only +0.5% within the last minute.
    expect(engine.check(prices(101.5), 120_000)).toEqual([]);
    expect(engine.check(prices(102.6), 140_000)).toHaveLength(1);
  });

  it("respects the direction", () => {
    const engine = new TriggerEngine();
    engine.load([percent({ direction: TriggerDirection.UP })]);
    engine.check(prices(100), 0);
    expect(engine.check(prices(90), MIN)).toEqual([]);
  });
});

describe("TriggerEngine price targets", () => {
  it("fires once when the price crosses the target and leaves the active set", () => {
    const engine = new TriggerEngine();
    engine.load([target()]);
    expect(engine.check(prices(105), 0)).toEqual([]);
    expect(engine.check(prices(111), MIN)).toEqual([
      expect.objectContaining({ kind: "target", price: 111 }),
    ]);
    expect(engine.size).toBe(0);
  });

  it("starts from the stored last price, so a crossing while the VM was down is caught", () => {
    const engine = new TriggerEngine();
    engine.load([target({ lastPrice: 100 })]);
    expect(engine.check(prices(115), 0)).toHaveLength(1);
  });

  it("does not fire for a price already beyond the target", () => {
    const engine = new TriggerEngine();
    engine.load([target({ lastPrice: 120 })]);
    expect(engine.check(prices(125), 0)).toEqual([]);
  });

  it("keeps state when the same rules are reloaded", () => {
    const engine = new TriggerEngine();
    engine.load([target({ lastPrice: null })]);
    engine.check(prices(105), 0);
    engine.load([target({ lastPrice: null })]);
    expect(engine.check(prices(111), MIN)).toHaveLength(1);
  });
});
