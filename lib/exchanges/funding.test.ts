import { describe, it, expect, vi } from "vitest";
import { FundingReader, positionOpening, fundingPeriod } from "./funding";
import type { OpenPosition } from "./types";
const position = (): OpenPosition => ({
  positionKey: "BTCUSDT:BOTH",
  symbol: "BTCUSDT",
  base: "BTC",
  settle: "USDT",
  side: "long",
  baseSize: "2",
  contracts: "2",
  contractSize: "1",
  entryPrice: "100",
  markPrice: "101",
  notionalUsd: "202",
  liquidationPrice: null,
  leverage: "2",
  marginMode: "cross",
  margin: "100",
  unrealizedPnl: "2",
  unrealizedPnlUsd: "2",
});
describe("funding attribution", () => {
  it("refreshes at HH:01 rather than ten minutes after startup", () => {
    const hour = Date.UTC(2026, 9, 7, 14);
    expect(fundingPeriod(hour + 59_999)).toBe(fundingPeriod(hour - 1));
    expect(fundingPeriod(hour + 60_000)).toBe(fundingPeriod(hour - 1) + 1);
    expect(fundingPeriod(hour + 3_599_999)).toBe(fundingPeriod(hour + 60_000));
  });
  it("uses native cumulative funding without reconstructing old fills", async () => {
    const request = vi.fn(async () => {
      throw Error("must not query history");
    });
    const p = position();
    await new FundingReader("hyperliquid", undefined, request).enrich(
      [p],
      new Map([[p.positionKey, "1.25"]]),
    );
    expect(p.funding).toMatchObject({ status: "complete", amount: "1.25" });
    expect(request).not.toHaveBeenCalled();
  });
  it("handles Bybit fills sharing a timestamp regardless of provider order", async () => {
    const now = Date.now(),
      p = position();
    p.positionKey = "BTCUSDT:0";
    const request = vi.fn(async () => ({
      retCode: 0,
      result: {
        list: [
          {
            symbol: p.symbol,
            currency: "USDT",
            type: "TRADE",
            transactionTime: now - 10000,
            side: "Buy",
            qty: "1",
            size: "1",
          },
          {
            symbol: p.symbol,
            currency: "USDT",
            type: "TRADE",
            transactionTime: now - 10000,
            side: "Buy",
            qty: "1",
            size: "2",
          },
          {
            symbol: p.symbol,
            currency: "USDT",
            type: "SETTLEMENT",
            transactionTime: now - 1000,
            funding: "-0.1",
          },
        ],
        nextPageCursor: "",
      },
    }));
    await new FundingReader("bybit", request).enrich([p]);
    expect(p.funding).toMatchObject({ status: "complete", amount: "-0.1" });
  });
  it("finds a reopened position after partial reductions and excludes the previous position", () => {
    expect(
      positionOpening("2", [
        { time: 10, quantity: "4" },
        { time: 20, quantity: "-4" },
        { time: 30, quantity: "3" },
        { time: 40, quantity: "-1" },
      ]),
    ).toBe(30);
    expect(positionOpening("-2", [{ time: 30, quantity: "-5" }])).toBe(30);
    expect(positionOpening("2", [{ time: 40, quantity: "-1" }])).toBeNull();
  });
  it("sums signed cash payments only and caches the result", async () => {
    const now = Date.now();
    const request = vi.fn(async (path: string) => {
      if (path === "userTrades")
        return [
          {
            symbol: "BTCUSDT",
            positionSide: "BOTH",
            side: "BUY",
            qty: "2",
            time: now - 10000,
          },
        ];
      if (path === "income")
        return [
          {
            symbol: "BTCUSDT",
            asset: "USDT",
            incomeType: "FUNDING_FEE",
            income: "-0.12",
            tranId: 1,
            time: now - 5000,
          },
          {
            symbol: "BTCUSDT",
            asset: "USDT",
            incomeType: "FUNDING_FEE",
            income: "0.02",
            tranId: 2,
            time: now - 1000,
          },
        ];
      if (path === "positionRisk")
        return [
          {
            symbol: "BTCUSDT",
            positionSide: "BOTH",
            positionAmt: "2",
            entryPrice: "100",
          },
        ];
      throw Error("Unexpected request");
    });
    const reader = new FundingReader("binance", request),
      p = position();
    await reader.enrich([p]);
    expect(p.funding?.status).toBe("complete");
    expect(p.funding?.amount).toBe("-0.1");
    await reader.enrich([position()]);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("does not show a fabricated zero when history fails or hedge allocation is ambiguous", async () => {
    const request = vi.fn(async () => {
      throw Error("offline");
    });
    const p = position();
    await new FundingReader("binance", request).enrich([p]);
    expect(p.funding).toMatchObject({ amount: null, status: "unavailable" });
    const hedge = position();
    hedge.positionKey = "BTCUSDT:LONG";
    request.mockClear();
    await new FundingReader("binance", request).enrich([hedge]);
    expect(hedge.funding?.status).toBe("unavailable");
    expect(request).not.toHaveBeenCalled();
  });
  it("uses Bybit funding separately from trading cash flow and fees", async () => {
    const now = Date.now(),
      p = position();
    p.positionKey = "BTCUSDT:0";
    const request = vi.fn(async () => ({
      retCode: 0,
      result: {
        list: [
          {
            symbol: p.symbol,
            currency: "USDT",
            type: "SETTLEMENT",
            transactionTime: now - 1000,
            funding: "0.25",
            cashFlow: "999",
            fee: "3",
          },
          {
            symbol: p.symbol,
            currency: "USDT",
            type: "TRADE",
            transactionTime: now - 10000,
            side: "Buy",
            qty: "2",
            size: "2",
          },
        ],
        nextPageCursor: "",
      },
    }));
    await new FundingReader("bybit", request).enrich([p]);
    expect(p.funding).toMatchObject({ status: "complete", amount: "0.25" });
  });
  it("uses Hyperliquid ledger cash signs and verifies current size", async () => {
    const now = Date.now(),
      p = position();
    p.base = "PURR";
    const info = vi.fn(async (body: Record<string, unknown>) =>
      body.type === "userFillsByTime"
        ? [
            {
              coin: "PURR",
              time: now - 10000,
              side: "B",
              sz: "2",
              startPosition: "0",
            },
          ]
        : [{ time: now - 1000, delta: { coin: "PURR", usdc: "-0.33" } }],
    );
    await new FundingReader("hyperliquid", undefined, info).enrich([p]);
    expect(p.funding).toMatchObject({ status: "complete", amount: "-0.33" });
  });
});
