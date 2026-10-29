import { describe, expect, it } from "vitest";
import { kyivDay, kyivDayStart, periodStart, tradeStats, type StatsTrade } from "./trade-stats";

const trade = (over: Partial<StatsTrade>): StatsTrade => ({
  id: "t",
  connectionId: "c1",
  exchange: "bybit",
  label: "Main",
  symbol: "AXSUSDT",
  base: "AXS",
  side: "short",
  size: 100,
  entryPrice: 0.21,
  exitPrice: 0.17,
  openedAt: null,
  closedAt: Date.UTC(2026, 9, 28, 12),
  pnlUsd: 10,
  exact: true,
  ...over,
});

describe("trading statistics", () => {
  it("uses Kyiv calendar days, also across the DST change", () => {
    // 23:30 UTC on 28 October is already 29 October in Kyiv (UTC+2 in winter).
    expect(kyivDay(Date.UTC(2026, 9, 28, 23, 30))).toBe("2026-10-29");
    expect(kyivDayStart("2026-10-29")).toBe(Date.UTC(2026, 9, 28, 22));
    expect(kyivDayStart("2026-07-01")).toBe(Date.UTC(2026, 5, 30, 21));
    const now = Date.UTC(2026, 9, 29, 10);
    expect(periodStart("today", now)).toBe(Date.UTC(2026, 9, 28, 22));
    // 23 October was still summer time (UTC+3): DST ended on 25 October.
    expect(periodStart("7d", now)).toBe(Date.UTC(2026, 9, 22, 21));
    expect(periodStart("all", now)).toBeNull();
  });

  it("sums results, wins, averages, extremes and groups", () => {
    const from = Date.UTC(2026, 9, 26, 22);
    const now = Date.UTC(2026, 9, 29, 10);
    const stats = tradeStats(
      [
        trade({ id: "a", pnlUsd: 104.67, openedAt: Date.UTC(2026, 9, 28, 10) }),
        trade({ id: "b", pnlUsd: -12.3, base: "BULL", exchange: "gate", connectionId: "c2", label: "Gate", closedAt: Date.UTC(2026, 9, 27, 9) }),
        trade({ id: "c", pnlUsd: 20, exact: false }),
      ],
      from,
      now,
    );
    expect(stats.summary).toMatchObject({ count: 3, wins: 2, losses: 1, avgLossUsd: -12.3, approximate: 1 });
    expect(stats.summary.totalUsd).toBeCloseTo(112.37, 9);
    expect(stats.summary.winRate).toBeCloseTo(2 / 3, 9);
    expect(stats.summary.best?.id).toBe("a");
    expect(stats.summary.worst?.id).toBe("b");
    expect(stats.summary.avgDurationMs).toBe(2 * 3_600_000);
    expect(stats.days.map((d) => [d.day, d.count])).toEqual([
      ["2026-10-27", 1],
      ["2026-10-28", 2],
      ["2026-10-29", 0],
    ]);
    expect(stats.days.at(-1)!.cumulativeUsd).toBeCloseTo(112.37, 9);
    expect(stats.byCoin.map((g) => [g.key, g.count])).toEqual([["AXS", 2], ["BULL", 1]]);
    expect(stats.byAccount[1]).toMatchObject({ key: "c2", label: "Gate", exchange: "gate" });
  });

  it("has no extremes or rates without trades", () => {
    const stats = tradeStats([], null, Date.UTC(2026, 9, 29));
    expect(stats.summary).toMatchObject({ count: 0, winRate: null, best: null, worst: null });
  });
});
