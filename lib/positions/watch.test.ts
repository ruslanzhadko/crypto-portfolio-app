import { describe, expect, it } from "vitest";
import type { OpenPosition } from "@/lib/exchanges/types";
import { DEFAULT_POSITION_ALERTS, readPositionAlertSettings } from "./alert-settings";
import { MIN_REPEAT_MS, PositionWatch, liquidationDistance } from "./watch";

const all = {
  ...DEFAULT_POSITION_ALERTS,
  opened: true,
  closed: true,
  pnlSign: true,
  liquidation: true,
};

function position(over: Partial<OpenPosition> = {}): OpenPosition {
  return {
    positionKey: "BTCUSDT:BOTH",
    symbol: "BTCUSDT",
    base: "BTC",
    settle: "USDT",
    side: "long",
    contracts: "0.1",
    contractSize: "1",
    baseSize: "0.1",
    notionalUsd: "7000",
    entryPrice: "70000",
    markPrice: "70000",
    liquidationPrice: "50000",
    leverage: "10",
    marginMode: "cross",
    margin: "700",
    unrealizedPnl: "10",
    unrealizedPnlUsd: "10",
    ...over,
  };
}

const futures = (...positions: OpenPosition[]) => [{ accountKey: "futures", positions }];

describe("PositionWatch", () => {
  it("uses the first poll as a base, then reports opened and closed positions", () => {
    const watch = new PositionWatch();
    expect(watch.observe("c1", futures(position()), all, 0)).toEqual([]);
    const eth = position({ positionKey: "ETHUSDT:BOTH", symbol: "ETHUSDT", base: "ETH" });
    const opened = watch.observe("c1", futures(position(), eth), all, 1000);
    expect(opened.map((e) => [e.kind, e.position.base])).toEqual([["opened", "ETH"]]);
    const closed = watch.observe("c1", futures(eth), all, 2000);
    expect(closed).toEqual([
      expect.objectContaining({ kind: "closed", pnlUsd: 10, position: expect.objectContaining({ base: "BTC" }) }),
    ]);
  });

  it("never reports a close for an account that was not read", () => {
    const watch = new PositionWatch();
    watch.observe("c1", futures(position()), all, 0);
    expect(watch.observe("c1", [{ accountKey: "futures" }], all, 1000)).toEqual([]);
    expect(watch.observe("c1", [], all, 2000)).toEqual([]);
    expect(watch.observe("c1", futures(), all, 3000).map((e) => e.kind)).toEqual(["closed"]);
  });

  it("treats a side flip under the same key as a close and an open", () => {
    const watch = new PositionWatch();
    watch.observe("c1", futures(position()), all, 0);
    const events = watch.observe("c1", futures(position({ side: "short" })), all, 1000);
    expect(events.map((e) => e.kind).sort()).toEqual(["closed", "opened"]);
  });

  it("alerts near liquidation once, then again only after moving away with a margin", () => {
    const watch = new PositionWatch();
    const at = (mark: string) => futures(position({ markPrice: mark, liquidationPrice: "100" }));
    watch.observe("c1", at("200"), all, 0);
    const near = watch.observe("c1", at("108"), all, 1);
    expect(near).toEqual([expect.objectContaining({ kind: "liquidation" })]);
    expect((near[0] as { distancePercent: number }).distancePercent).toBeCloseTo(7.41, 1);
    // Hovering around the threshold: no repeat.
    expect(watch.observe("c1", at("112"), all, MIN_REPEAT_MS * 2)).toEqual([]);
    expect(watch.observe("c1", at("108"), all, MIN_REPEAT_MS * 3)).toEqual([]);
    // Back above 13% (10% + 3%), then close again.
    watch.observe("c1", at("120"), all, MIN_REPEAT_MS * 4);
    expect(watch.observe("c1", at("105"), all, MIN_REPEAT_MS * 5).map((e) => e.kind)).toEqual(["liquidation"]);
  });

  it("does not alert for a position already near liquidation in the base", () => {
    const watch = new PositionWatch();
    const near = futures(position({ markPrice: "105", liquidationPrice: "100" }));
    watch.observe("c1", near, all, 0);
    expect(watch.observe("c1", near, all, 1000)).toEqual([]);
  });

  it("alerts a new position that opens inside the liquidation threshold", () => {
    const watch = new PositionWatch();
    watch.observe("c1", futures(), all, 0);
    const events = watch.observe("c1", futures(position({ markPrice: "105", liquidationPrice: "100" })), all, 1);
    expect(events.map((e) => e.kind)).toEqual(["opened", "liquidation"]);
  });

  it("reports the PnL sign only after leaving the band around zero", () => {
    const watch = new PositionWatch();
    // Band: 5% of a $700 margin = $35.
    const pnl = (usd: string) => futures(position({ unrealizedPnlUsd: usd }));
    watch.observe("c1", pnl("100"), all, 0);
    expect(watch.observe("c1", pnl("-20"), all, 1)).toEqual([]);
    const minus = watch.observe("c1", pnl("-50"), all, 2);
    expect(minus).toEqual([expect.objectContaining({ kind: "pnlSign", positive: false, pnlUsd: -50 })]);
    // Within five minutes the same rule stays quiet, but the sign is still tracked.
    expect(watch.observe("c1", pnl("80"), all, 3)).toEqual([]);
    expect(watch.observe("c1", pnl("-80"), all, MIN_REPEAT_MS + 10).map((e) => e.kind)).toEqual(["pnlSign"]);
  });

  it("uses the position size when the margin is unknown", () => {
    const watch = new PositionWatch();
    // 0.5% of a $28.60 position = $0.143: cents of noise stay quiet.
    const zec = (usd: string) =>
      futures(position({ margin: null, notionalUsd: "28.6", unrealizedPnlUsd: usd }));
    watch.observe("c1", zec("0.2"), all, 0);
    expect(watch.observe("c1", zec("-0.03"), all, 1)).toEqual([]);
    expect(watch.observe("c1", zec("-0.2"), all, 2).map((e) => e.kind)).toEqual(["pnlSign"]);
  });

  it("emits only the kinds that are switched on", () => {
    const watch = new PositionWatch();
    const onlyClosed = { ...DEFAULT_POSITION_ALERTS, closed: true };
    watch.observe("c1", futures(position()), onlyClosed, 0);
    const eth = position({ positionKey: "ETHUSDT:BOTH", base: "ETH" });
    expect(watch.observe("c1", futures(position(), eth), onlyClosed, 1)).toEqual([]);
    expect(watch.observe("c1", futures(eth), onlyClosed, 2).map((e) => e.kind)).toEqual(["closed"]);
  });
});

describe("liquidationDistance", () => {
  it("is unknown without prices", () => {
    expect(liquidationDistance({ ...position(), accountKey: "f", liquidationPrice: null })).toBeNull();
    expect(liquidationDistance({ ...position(), accountKey: "f", markPrice: "0" })).toBeNull();
  });
});

describe("readPositionAlertSettings", () => {
  it("falls back to defaults for broken values and keeps valid ones", () => {
    expect(readPositionAlertSettings(null)).toEqual(DEFAULT_POSITION_ALERTS);
    expect(readPositionAlertSettings({ liquidationPercent: 7 })).toEqual(DEFAULT_POSITION_ALERTS);
    expect(readPositionAlertSettings({ closed: true })).toEqual({ ...DEFAULT_POSITION_ALERTS, closed: true });
  });
});
