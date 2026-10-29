import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./pricing", () => ({ settlementPrices: async () => new Map() }));
import {
  bingxClosedTrades,
  bingxTradesFromOrders,
  bybitClosedTrades,
  gateClosedTrades,
  splitLinearSymbol,
} from "./closed-trades";

describe("closed trades from exchange history", () => {
  it("splits linear symbols", () => {
    expect(splitLinearSymbol("XRPUSDT")).toEqual({ base: "XRP", settle: "USDT" });
    expect(splitLinearSymbol("BTCPERP")).toEqual({ base: "BTC", settle: "USDC" });
  });

  it("joins Bybit partial closes of one position, even with other coins in between", () => {
    const trades = bybitClosedTrades([
      { symbol: "AXSUSDT", orderId: "a1", side: "Buy", closedSize: "100", avgEntryPrice: "0.21", avgExitPrice: "0.18", cumExitValue: "18", closedPnl: "2.9", updatedTime: "1000" },
      { symbol: "XRPUSDT", orderId: "x1", side: "Sell", closedSize: "3", avgEntryPrice: "0.6045", avgExitPrice: "0.605", cumExitValue: "1.815", closedPnl: "-0.00049568", updatedTime: "1500" },
      { symbol: "AXSUSDT", orderId: "a2", side: "Buy", closedSize: "100", avgEntryPrice: "0.2100004", avgExitPrice: "0.16", cumExitValue: "16", closedPnl: "4.9", updatedTime: "2000" },
      // A new position later at another entry price is a new trade.
      { symbol: "AXSUSDT", orderId: "a3", side: "Buy", closedSize: "50", avgEntryPrice: "0.17", avgExitPrice: "0.165", cumExitValue: "8.25", closedPnl: "0.2", updatedTime: "3000" },
    ]);
    expect(trades.map((t) => [t.externalId, t.side, t.size, t.exitPrice, t.pnl, t.closedAt])).toEqual([
      ["bybit:a1", "short", "200", "0.17", "7.8", 2000],
      ["bybit:x1", "long", "3", "0.605", "-0.00049568", 1500],
      ["bybit:a3", "short", "50", "0.165", "0.2", 3000],
    ]);
  });

  it("reads Gate closes with entry and exit by direction", () => {
    const [trade] = gateClosedTrades(
      [{ contract: "SLERF_USDT", long_price: "0.766306", short_price: "0.539119", pnl: "-23.41702352", accum_size: "100", time: 1711279263, side: "long", first_open_time: 1711037985 }],
      new Map([["SLERF_USDT", "1"]]),
    );
    expect(trade).toMatchObject({
      base: "SLERF", settle: "USDT", side: "long", size: "100", entryPrice: "0.766306", exitPrice: "0.539119",
      pnl: "-23.41702352", openedAt: 1711037985000, closedAt: 1711279263000,
    });
  });

  it("keeps only fully closed BingX positions with the net result", () => {
    const base = { positionId: "1", symbol: "LTC-USDT", positionSide: "LONG", openTime: 1, updateTime: 2, avgPrice: "95.18", avgClosePrice: "129.48", netProfit: "99.63", closePositionAmt: "30.0" };
    const trades = bingxClosedTrades([
      { ...base, closeAllPositions: true },
      { ...base, positionId: "2", closeAllPositions: false },
    ]);
    expect(trades).toEqual([
      expect.objectContaining({ externalId: "bingx:1", base: "LTC", settle: "USDT", side: "long", pnl: "99.63", size: "30" }),
    ]);
  });

  it("rebuilds BingX positions from orders when the position history is empty", () => {
    const o = (id: string, side: string, positionSide: string, qty: string, price: string, at: number, profit = "0", commission = "-0.01") =>
      ({ orderId: id, symbol: "ZEC-USDT", side, positionSide, executedQty: qty, avgPrice: price, profit, commission, status: "FILLED", updateTime: at });
    const trades = bingxTradesFromOrders([
      // A close of a position opened before the range: no entry known, skipped.
      o("x0", "SELL", "LONG", "1", "1300", 500, "5"),
      o("a1", "BUY", "LONG", "0.01", "1300", 1000),
      o("a2", "BUY", "LONG", "0.01", "1320", 2000),
      o("a3", "SELL", "LONG", "0.01", "1340", 3000, "0.3"),
      o("a4", "SELL", "LONG", "0.01", "1360", 4000, "0.4"),
      // One-way short, closed in one order.
      { ...o("b1", "SELL", "BOTH", "2", "100", 5000), symbol: "HYPE-USDT" },
      { ...o("b2", "BUY", "BOTH", "2", "95", 6000, "10", "-0.05"), symbol: "HYPE-USDT" },
      // Still open: not a trade yet.
      o("c1", "BUY", "SHORT", "1", "1400", 7000),
    ]);
    expect(trades).toEqual([
      expect.objectContaining({ externalId: "bingx:order:a1", side: "long", size: "0.02", entryPrice: "1310", exitPrice: "1350", openedAt: 1000, closedAt: 4000, pnl: "0.66" }),
      expect.objectContaining({ externalId: "bingx:order:b1", base: "HYPE", side: "short", entryPrice: "100", exitPrice: "95", pnl: "9.94" }),
    ]);
  });
});
