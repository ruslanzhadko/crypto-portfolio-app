import { afterEach, describe, expect, it, vi } from "vitest";
import { CycleHistoryReader } from "./cycle-history";
import type { OpenPosition } from "./types";

const now = Date.UTC(2026, 9, 9, 14, 5),
  opening = now - 3600_000;
function position(venue: "bingx" | "aster" = "bingx"): OpenPosition {
  const symbol = venue === "bingx" ? "ETH-USDT" : "ETHUSDT";
  return {
    positionKey: venue === "bingx" ? "123" : `${symbol}:LONG`,
    symbol,
    base: "ETH",
    settle: "USDT",
    side: "long",
    baseSize: "1",
    contracts: "1",
    contractSize: "1",
    entryPrice: "2000",
    markPrice: "2100",
    notionalUsd: "2100",
    liquidationPrice: "1700",
    leverage: "10",
    marginMode: "cross",
    margin: "210",
    unrealizedPnl: "100",
    unrealizedPnlUsd: "100",
    funding: {
      amount: null,
      since: null,
      updatedAt: now,
      status: "pending",
      nextRate: "0.0001",
      nextTime: now + 3600_000,
    },
  };
}
function fixture(venue: "bingx" | "aster" = "bingx") {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const p = position(venue);
  const fills = [
    {
      id: "1",
      tradeId: "1",
      orderId: "1",
      symbol: p.symbol,
      positionSide: "LONG",
      side: "BUY",
      qty: "2",
      time: opening,
      commission: "-0.8",
      currency: "USDT",
      commissionAsset: "USDT",
      realizedPnl: "0",
    },
    {
      id: "2",
      tradeId: "2",
      orderId: "2",
      symbol: p.symbol,
      positionSide: "LONG",
      side: "SELL",
      qty: "1",
      time: opening + 1000,
      commission: "0.1",
      currency: "USDT",
      commissionAsset: "USDT",
      realizedPnl: "50",
    },
  ];
  const ledger = [
    {
      symbol: p.symbol,
      incomeType: "FUNDING_FEE",
      asset: "USDT",
      income: "0.18",
      time: opening + 3000,
      tranId: "1",
    },
  ];
  const request = vi.fn(
    async (
      path: string,
      _api: string,
      params: Record<string, unknown> = {},
    ) => {
      let data: unknown;
      if (path.endsWith("marginType")) data = { marginType: "CROSSED" };
      else if (path.endsWith("allOrders"))
        data = fills.map((r) => ({
          orderId: r.orderId,
          executedQty: r.qty,
          symbol: r.symbol,
          side: r.side,
          positionSide: r.positionSide,
        }));
      else if (path.endsWith("allFillOrders") || path.endsWith("userTrades"))
        data = fills.filter(
          (r) =>
            r.time >= Number(params.startTs ?? params.startTime) &&
            r.time <= Number(params.endTs ?? params.endTime),
        );
      else if (path.endsWith("income"))
        data =
          params.incomeType === "COMMISSION"
            ? fills
                .filter(
                  (r) =>
                    r.time >= Number(params.startTime) &&
                    r.time <= Number(params.endTime),
                )
                .map((r) => ({
                  symbol: p.symbol,
                  incomeType: "COMMISSION",
                  asset: r.commissionAsset,
                  income: r.commission,
                  time: r.time,
                  tranId: r.id,
                  tradeId: r.id,
                }))
            : ledger.filter(
                (r) =>
                  r.time >= Number(params.startTime) &&
                  r.time <= Number(params.endTime),
              );
      else if (path.endsWith("positions") || path.endsWith("positionRisk"))
        data = [
          {
            positionId: "123",
            symbol: p.symbol,
            positionSide: "LONG",
            positionAmt: p.baseSize,
            avgPrice: p.entryPrice,
            entryPrice: p.entryPrice,
          },
        ];
      else throw new Error("Unexpected request");
      return venue === "bingx" ? { code: 0, data } : data;
    },
  );
  return {
    p,
    fills,
    ledger,
    request,
    reader: new CycleHistoryReader(venue, request),
  };
}
afterEach(() => vi.useRealTimers());
describe("current cycle funding and fees", () => {
  it("reads a 108-day Aster cycle and keeps ASTER fees separate from USDT", async () => {
    const f = fixture("aster");
    const old = now - 108 * 86400_000;
    f.fills[0]!.time = old;
    f.fills[0]!.commissionAsset = "ASTER";
    f.fills[1]!.time = old + 1000;
    f.ledger[0]!.time = old + 3000;
    await f.reader.enrich([f.p]);
    expect(f.p.funding).toMatchObject({
      since: old,
      amount: "0.18",
      realizedPnl: "50",
      tradingFees: null,
      tradingFeesByAsset: { ASTER: "0.8", USDT: "-0.1" },
      breakEvenPrice: null,
      status: "complete",
    });
    expect(f.request.mock.calls.length).toBeLessThanOrEqual(82);
  });
  it("ignores foreign commissions from a previous Aster cycle", async () => {
    const f = fixture("aster");
    f.fills.push(
      {
        ...f.fills[0]!,
        id: "old1",
        tradeId: "old1",
        qty: "1",
        time: opening - 2000,
        commissionAsset: "ASTER",
      },
      {
        ...f.fills[1]!,
        id: "old2",
        tradeId: "old2",
        qty: "1",
        time: opening - 1000,
        commissionAsset: "ASTER",
      },
    );
    await f.reader.enrich([f.p]);
    expect(f.p.funding).toMatchObject({
      since: opening,
      tradingFees: "0.7",
      amount: "0.18",
    });
  });
  it.each(["bingx", "aster"] as const)(
    "reads %s opening, reductions, rebates and funding without double counting",
    async (venue) => {
      const f = fixture(venue);
      await f.reader.enrich([f.p]);
      expect(f.p.funding).toMatchObject({
        amount: "0.18",
        realizedPnl: "50",
        tradingFees: "0.7",
        since: opening,
        status: "complete",
        breakEvenPrice: "1950.52",
        nextRate: "0.0001",
      });
    },
  );
  it("caches until HH:01 but invalidates on a size change", async () => {
    const f = fixture();
    await f.reader.enrich([f.p]);
    f.request.mockClear();
    vi.setSystemTime(Date.UTC(2026, 9, 9, 15, 0));
    await f.reader.enrich([f.p]);
    expect(f.request).not.toHaveBeenCalled();
    vi.setSystemTime(Date.UTC(2026, 9, 9, 15, 1));
    await f.reader.enrich([f.p]);
    expect(f.request).toHaveBeenCalled();
    f.request.mockClear();
    f.p.baseSize = "0.5";
    await f.reader.enrich([f.p]);
    expect(f.request).toHaveBeenCalled();
  });
  it("excludes previous cycles and rejects silent fill truncation", async () => {
    const f = fixture();
    f.fills.push(
      {
        ...f.fills[0]!,
        id: "old-open",
        tradeId: "old-open",
        orderId: "old-open",
        qty: "1",
        time: opening - 2000,
        commission: "-10",
      },
      {
        ...f.fills[1]!,
        id: "old-close",
        tradeId: "old-close",
        orderId: "old-close",
        time: opening - 1000,
        realizedPnl: "999",
      },
    );
    await f.reader.enrich([f.p]);
    expect(f.p.funding).toMatchObject({
      realizedPnl: "50",
      tradingFees: "0.7",
      since: opening,
    });
    const truncated = fixture(),
      original = truncated.request.getMockImplementation()!;
    truncated.request.mockImplementation(async (path, api, params) =>
      path.endsWith("allOrders")
        ? { code: 0, data: [{ orderId: "1", executedQty: "3" }] }
        : original(path, api, params),
    );
    await truncated.reader.enrich([truncated.p]);
    expect(truncated.p.funding?.amount).toBeNull();
  });
  it("does not fabricate funding for concurrent hedge legs, but keeps attributable fees", async () => {
    const f = fixture();
    const other = { ...f.p, positionKey: "456", side: "short" as const };
    await f.reader.enrich([f.p, other]);
    expect(f.p.funding).toMatchObject({
      amount: null,
      tradingFees: "0.7",
      realizedPnl: "50",
    });
    expect(other.funding?.status).toBe("pending");
  });
  it("rejects a previous position cycle, missing history, split isolated and malformed cashflows", async () => {
    for (const change of ["missing", "duplicate", "foreign", "split"]) {
      const f = fixture();
      if (change === "missing") f.fills.splice(0);
      if (change === "duplicate") f.fills.push(f.fills[0]!);
      if (change === "foreign") f.ledger[0]!.asset = "BTC";
      if (change === "split")
        f.request.mockImplementation(async () => ({
          code: 0,
          data: { marginType: "SEPARATE_ISOLATED" },
        }));
      await f.reader.enrich([f.p]);
      expect(f.p.funding).toMatchObject({
        amount: null,
        tradingFees: null,
        status: "unavailable",
      });
      vi.useRealTimers();
    }
  });
  it("resolves legacy BingX fill side using orders without collapsing multiple fills", async () => {
    const f = fixture();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (path, api, params) => {
      if (path === "trade/allFillOrders")
        return {
          code: 0,
          data: {
            fill_orders: f.fills.map(
              ({
                side: _side,
                symbol: _symbol,
                positionSide: _positionSide,
                ...r
              }) => ({
                ...r,
                orderId: r.id,
              }),
            ),
          },
        };
      if (path === "trade/allOrders")
        return {
          code: 0,
          data: f.fills.map((r) => ({
            orderId: r.id,
            side: r.side,
            symbol: r.symbol,
            positionSide: r.positionSide,
            executedQty: r.qty,
          })),
        };
      return original(path, api, params);
    });
    await f.reader.enrich([f.p]);
    expect(f.p.funding?.amount).toBe("0.18");
  });
  it("reads legacy BingX realized cashflow from income when fills omit it", async () => {
    const f = fixture(),
      original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (path, api, params = {}) => {
      if (path === "trade/allFillOrders")
        return {
          code: 0,
          data: f.fills.map(({ realizedPnl: _realized, ...r }) => r),
        };
      if (path === "user/income" && params.incomeType === "REALIZED_PNL")
        return {
          code: 0,
          data: [
            {
              symbol: f.p.symbol,
              incomeType: "REALIZED_PNL",
              asset: "USDT",
              income: "50",
              time: opening + 1000,
              tranId: "2",
            },
          ],
        };
      return original(path, api, params);
    });
    await f.reader.enrich([f.p]);
    expect(f.p.funding).toMatchObject({
      amount: "0.18",
      realizedPnl: "50",
      tradingFees: "0.7",
    });
  });
});
