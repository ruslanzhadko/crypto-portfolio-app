import { describe, expect, it } from "vitest";
import { summarizePositions } from "./position-summary";

describe("position summary", () => {
  it("includes Aster's known subtotal and identifies unconverted commissions", () => {
    const summary = summarizePositions(
      [
        {
          side: "long",
          settle: "USDT",
          notionalUsd: "2700",
          unrealizedPnlUsd: "946",
          funding: {
            status: "complete",
            realizedPnl: "431.4397",
            amount: "-47.7296",
            tradingFees: null,
            tradingFeesByAsset: { ASTER: "0.0886178", USDT: "0" },
          },
        },
        {
          side: "short",
          settle: "USDT",
          notionalUsd: "100",
          unrealizedPnlUsd: "-10",
          funding: {
            status: "complete",
            realizedPnl: "-14.40",
            amount: "0",
            tradingFees: "0",
          },
        },
      ],
      new Map([["USDT", "1"]]),
    );
    expect(summary.realized).toEqual({
      value: "369.3101",
      known: 2,
      excludedFeeAssets: ["ASTER"],
    });
  });
  it("converts settlement currencies and includes funding minus fees", () => {
    const summary = summarizePositions(
      [
        {
          side: "long",
          settle: "USDT",
          notionalUsd: "100",
          unrealizedPnlUsd: "-5",
          funding: {
            status: "complete",
            realizedPnl: "2",
            amount: "0.18",
            tradingFees: "0.1",
          },
        },
        {
          side: "short",
          settle: "USDC",
          notionalUsd: "200",
          unrealizedPnlUsd: "10",
          funding: {
            status: "complete",
            realizedPnl: "0",
            amount: "10",
            tradingFees: "1",
          },
        },
      ],
      new Map([
        ["USDT", "1"],
        ["USDC", "0.99"],
      ]),
    );
    expect(summary).toEqual({
      count: 2,
      long: 1,
      short: 1,
      volume: { value: "300", known: 2 },
      realized: { value: "10.99", known: 2 },
      unrealized: { value: "5", known: 2 },
    });
  });
  it("distinguishes unknown totals from zero", () => {
    const summary = summarizePositions(
      [
        {
          side: "long",
          settle: "USDT",
          notionalUsd: null,
          unrealizedPnlUsd: null,
          funding: null,
        },
      ],
      new Map(),
    );
    expect(summary.realized).toEqual({ value: null, known: 0 });
    expect(summary.volume.value).toBeNull();
    expect(summarizePositions([], new Map()).realized.value).toBe("0");
  });
});
