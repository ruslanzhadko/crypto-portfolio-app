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
  it("normalizes Hyperliquid paid and received funding independently of direction", async () => {
    for (const [raw, expected] of [
      ["-10.6607", "10.6607"],
      ["2.1", "-2.1"],
      ["0", "0"],
    ] as const) {
      const p = position();
      await new FundingReader("hyperliquid", undefined, async () => {
        throw Error("history unavailable");
      }).enrich([p], new Map([[p.positionKey, raw]]));
      expect(p.funding).toMatchObject({
        status: "complete",
        amount: expected,
        realizedPnl: null,
      });
    }
  });
  it("separates Bybit realized trading cash flow from funding and excludes the old position", async () => {
    const now = Date.now(),
      p = position();
    p.positionKey = "BTCUSDT:0";
    const reader = new FundingReader("bybit", async () => ({
      retCode: 0,
      result: {
        list: [
          {
            symbol: p.symbol,
            currency: p.settle,
            type: "TRADE",
            transactionTime: now - 1000,
            side: "Sell",
            qty: "1",
            size: "2",
            cashFlow: "12",
            fee: "3",
          },
          {
            symbol: p.symbol,
            currency: p.settle,
            type: "SETTLEMENT",
            transactionTime: now - 2000,
            funding: "-0.25",
            cashFlow: "999",
          },
          {
            symbol: p.symbol,
            currency: p.settle,
            type: "TRADE",
            transactionTime: now - 3000,
            side: "Buy",
            qty: "3",
            size: "3",
            cashFlow: "0",
            fee: "0.5",
          },
          {
            symbol: p.symbol,
            currency: p.settle,
            type: "TRADE",
            transactionTime: now - 4000,
            side: "Sell",
            qty: "4",
            size: "0",
            cashFlow: "500",
          },
        ],
        nextPageCursor: "",
      },
    }));
    await reader.enrich([p]);
    expect(p.funding).toMatchObject({
      amount: "-0.25",
      realizedPnl: "12",
      tradingFees: "3.5",
    });
  });
  it("uses native Hyperliquid funding and realized PnL from partial closes without funding history", async () => {
    const now = Date.now(),
      p = position();
    const info = vi.fn(async (body: Record<string, unknown>) => {
      expect(body.type).toBe("userFillsByTime");
      return [
        {
          coin: p.base,
          time: now - 1000,
          side: "A",
          sz: "1",
          startPosition: "3",
          closedPnl: "7.5",
          fee: "-0.05",
          feeToken: p.settle,
        },
        {
          coin: p.base,
          time: now - 2000,
          side: "B",
          sz: "3",
          startPosition: "0",
          closedPnl: "0",
          fee: "0.25",
          builderFee: "0.1",
          feeToken: p.settle,
        },
      ];
    });
    await new FundingReader("hyperliquid", undefined, info).enrich(
      [p],
      new Map([[p.positionKey, "-10.6607"]]),
    );
    expect(p.funding).toMatchObject({
      amount: "10.6607",
      realizedPnl: "7.5",
      tradingFees: "0.2",
    });
    expect(info).toHaveBeenCalledTimes(1);
  });

  it.each(["USDT", "BNB"])(
    "includes Binance opening and close fees without double-counting income commissions (%s)",
    async (asset) => {
      const now = Date.now(),
        p = position();
      const request = vi.fn(async (path: string) => {
        if (path === "userTrades")
          return [
            {
              symbol: p.symbol,
              positionSide: "BOTH",
              side: "BUY",
              qty: "3",
              time: now - 3000,
              commission: "0.15",
              commissionAsset: asset,
            },
            {
              symbol: p.symbol,
              positionSide: "BOTH",
              side: "SELL",
              qty: "1",
              time: now - 1000,
              commission: "0.05",
              commissionAsset: asset,
            },
            {
              symbol: p.symbol,
              positionSide: "BOTH",
              side: "SELL",
              qty: "4",
              time: now - 4000,
              commission: "99",
              commissionAsset: asset,
            },
          ];
        if (path === "income")
          return [
            {
              symbol: p.symbol,
              asset: p.settle,
              incomeType: "REALIZED_PNL",
              income: "5",
              tranId: 1,
              time: now - 1000,
            },
            {
              symbol: p.symbol,
              asset,
              incomeType: "COMMISSION",
              income: "-0.05",
              tranId: 2,
              time: now - 1000,
            },
          ];
        if (path === "positionRisk")
          return [
            {
              symbol: p.symbol,
              positionSide: "BOTH",
              positionAmt: "2",
              entryPrice: "100",
            },
          ];
        throw Error("unexpected request");
      });
      await new FundingReader("binance", request).enrich([p]);
      expect(p.funding).toMatchObject({
        amount: "0",
        realizedPnl: "5",
        tradingFees: asset === "USDT" ? "0.2" : null,
      });
      expect(request).toHaveBeenCalledTimes(3);
    },
  );
  it("does not attribute the previous position's reversal fee to the current position", async () => {
    const p = position(),
      now = Date.now();
    await new FundingReader("hyperliquid", undefined, async () => [
      {
        coin: p.base,
        time: now - 1000,
        side: "B",
        sz: "5",
        startPosition: "-3",
        closedPnl: "42",
        fee: "1",
        feeToken: p.settle,
      },
    ]).enrich([p], new Map([[p.positionKey, "0"]]));
    expect(p.funding).toMatchObject({
      status: "complete",
      amount: "0",
      realizedPnl: "0",
      tradingFees: null,
    });
  });
  it("refreshes at HH:01 rather than ten minutes after startup", () => {
    const hour = Date.UTC(2026, 9, 7, 14);
    expect(fundingPeriod(hour + 59_999)).toBe(fundingPeriod(hour - 1));
    expect(fundingPeriod(hour + 60_000)).toBe(fundingPeriod(hour - 1) + 1);
    expect(fundingPeriod(hour + 3_599_999)).toBe(fundingPeriod(hour + 60_000));
  });
  it("preserves native funding when realized-PnL history is unavailable", async () => {
    const request = vi.fn(async () => {
      throw Error("must not query history");
    });
    const p = position();
    await new FundingReader("hyperliquid", undefined, request).enrich(
      [p],
      new Map([[p.positionKey, "1.25"]]),
    );
    expect(p.funding).toMatchObject({ status: "complete", amount: "-1.25" });
    expect(request).toHaveBeenCalledTimes(1);
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
            incomeType: "REALIZED_PNL",
            income: "4.5",
            tranId: 1,
            time: now - 500,
          },
          {
            symbol: "BTCUSDT",
            asset: "BNB",
            incomeType: "COMMISSION",
            income: "-1",
            tranId: 3,
            time: now - 500,
          },
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
    expect(p.funding?.realizedPnl).toBe("4.5");
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
              closedPnl: "0",
            },
          ]
        : [{ time: now - 1000, delta: { coin: "PURR", usdc: "-0.33" } }],
    );
    await new FundingReader("hyperliquid", undefined, info).enrich([p]);
    expect(p.funding).toMatchObject({ status: "complete", amount: "-0.33" });
  });
});
