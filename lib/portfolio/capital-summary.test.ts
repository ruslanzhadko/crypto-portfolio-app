import { describe, expect, it } from "vitest";
import { summarizeOverview } from "./capital-summary";

describe("capital summary", () => {
  it("shows PnL only with open positions", () => {
    expect(summarizeOverview({ totalUsd: "100", unrealizedPnlUsd: "-5", positionCount: 2, stale: false })).toEqual({
      totalUsd: "100",
      pnlUsd: "-5",
      positions: 2,
      stale: false,
    });
    expect(summarizeOverview({ totalUsd: "100", unrealizedPnlUsd: "0", positionCount: 0, stale: true }).pnlUsd).toBeNull();
  });
});
