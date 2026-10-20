import { describe, expect, it } from "vitest";
import { summarizePositions } from "./position-summary";

describe("position summary", () => {
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
      volume: { value: "300", known: 2, total: 2 },
      realized: { value: "10.99", known: 2, total: 2 },
      unrealized: { value: "5", known: 2, total: 2 },
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
    expect(summary.realized).toEqual({ value: null, known: 0, total: 1 });
    expect(summary.volume.value).toBeNull();
    expect(summarizePositions([], new Map()).realized.value).toBe("0");
  });
  it("leaves Aster Shield positions out of realized PnL coverage", () => {
    const summary = summarizePositions(
      [
        {
          side: "long",
          settle: "USDT",
          notionalUsd: "100",
          unrealizedPnlUsd: "1",
          funding: {
            status: "complete",
            realizedPnl: "2",
            amount: "0",
            tradingFees: "0",
          },
        },
        {
          side: "long",
          settle: "USDT",
          notionalUsd: "5000",
          unrealizedPnlUsd: "-1",
          funding: {
            status: "unavailable",
            amount: null,
            shield: {
              takeProfit: null,
              stopLoss: null,
              feeMode: "PROFIT",
              openedAt: 1,
            },
          },
        },
      ],
      new Map([["USDT", "1"]]),
    );
    expect(summary.count).toBe(2);
    expect(summary.realized).toEqual({ value: "2", known: 1, total: 1 });
    expect(summary.unrealized).toEqual({ value: "0", known: 2, total: 2 });
  });
});
