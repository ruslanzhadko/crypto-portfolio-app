import { describe, expect, it } from "vitest";
import { dailyChange, summarizeOverview, type CapitalSummary } from "./capital-summary";

const overview = { totalUsd: "100", unrealizedPnlUsd: "-5", positionCount: 2, stale: false, sourceSet: "s1" };

describe("capital summary", () => {
  it("shows PnL only with open positions", () => {
    expect(summarizeOverview(overview)).toEqual({
      totalUsd: "100",
      pnlUsd: "-5",
      positions: 2,
      stale: false,
      sourceSet: "s1",
    });
    expect(summarizeOverview({ ...overview, unrealizedPnlUsd: "0", positionCount: 0 }).pnlUsd).toBeNull();
  });
});

describe("daily change", () => {
  const summary: CapitalSummary = { totalUsd: "110", pnlUsd: null, positions: 0, stale: false, sourceSet: "s1" };

  it("compares with the capital a day ago", () => {
    const change = dailyChange(summary, { totalUsd: "100", sourceSet: "s1" });
    expect(change?.usd).toBeCloseTo(10, 9);
    expect(change?.percent).toBeCloseTo(10, 9);
  });

  it("is unknown without a snapshot or after wallets or accounts changed", () => {
    expect(dailyChange(summary, null)).toBeNull();
    expect(dailyChange(summary, { totalUsd: "100", sourceSet: "s0" })).toBeNull();
  });

  it("wallet-only users have no source set to compare; a zero start has no percent", () => {
    expect(dailyChange({ ...summary, sourceSet: null }, { totalUsd: "100", sourceSet: null })?.usd).toBeCloseTo(10, 9);
    expect(dailyChange(summary, { totalUsd: "0", sourceSet: "s1" })?.percent).toBeNull();
  });
});
