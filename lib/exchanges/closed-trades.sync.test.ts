import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({})),
  findMany: vi.fn(async (): Promise<unknown[]> => []),
  updateMany: vi.fn(async () => ({ count: 1 })),
  deleteMany: vi.fn(async () => ({ count: 0 })),
  update: vi.fn(async () => ({})),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    closedTrade: { upsert: db.upsert, deleteMany: db.deleteMany, findMany: db.findMany, updateMany: db.updateMany },
    exchangeConnection: { update: db.update },
  },
}));
vi.mock("./pricing", () => ({ settlementPrices: async () => new Map([["USDT", "1"]]) }));
import { matchEstimates, reconcileEstimatedTrades, syncClosedTrades } from "./closed-trades";
import type { ExchangeAdapter } from "./types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5);
const adapter = {
  closedTrades: vi.fn(async () => [
    {
      externalId: "gate:1", symbol: "BTC_USDT", base: "BTC", settle: "USDT", side: "long" as const,
      size: "1", entryPrice: "1", exitPrice: "2", openedAt: NOW - 2 * DAY, closedAt: NOW - DAY, pnl: "1",
    },
  ]),
} as unknown as ExchangeAdapter;

beforeEach(() => vi.clearAllMocks());
vi.spyOn(console, "log").mockImplementation(() => {});

describe("closed trade import", () => {
  it("a weekly read only adds and refreshes trades, it never deletes", async () => {
    const connection = { id: "c1", userId: "u1", exchange: "gate", tradesAt: new Date(NOW - DAY), createdAt: new Date(NOW - 90 * DAY) };
    expect(await syncClosedTrades(connection, adapter, NOW)).toBe("saved");
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("a month read replaces only the trades that lie wholly inside the month", async () => {
    const connection = { id: "c2", userId: "u1", exchange: "gate", tradesAt: null, createdAt: new Date(NOW - 90 * DAY) };
    expect(await syncClosedTrades(connection, adapter, NOW)).toBe("saved");
    const where = (db.deleteMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({
      connectionId: "c2",
      source: "history",
      closedAt: { gte: new Date(NOW - 30 * DAY) },
      OR: [{ openedAt: null }, { openedAt: { gte: new Date(NOW - 30 * DAY) } }],
      externalId: { notIn: ["gate:1"] },
    });
  });

  describe("exchanges whose closes the worker records", () => {
    const CUTOFF = Date.UTC(2026, 9, 29, 16, 44);
    const trade = (externalId: string, closedAt: number) => ({
      externalId, symbol: "BTC-USDT", base: "BTC", settle: "USDT", side: "long" as const,
      size: "1", entryPrice: "1", exitPrice: "2", openedAt: closedAt - DAY, closedAt, pnl: "1",
    });
    const reader = (rows: ReturnType<typeof trade>[]) =>
      ({ closedTrades: vi.fn(async () => rows) }) as unknown as ExchangeAdapter;
    const saved = () =>
      (db.upsert.mock.calls as unknown as [{ create: { externalId: string } }][]).map(([call]) => call.create.externalId);

    it("a connection added later reads the history up to its own creation", async () => {
      const createdAt = new Date(CUTOFF + DAY);
      const connection = { id: "c3", userId: "u1", exchange: "bingx", tradesAt: null, createdAt };
      const rows = [trade("before", CUTOFF - DAY), trade("gap", CUTOFF + DAY / 2), trade("watched", CUTOFF + 2 * DAY)];
      expect(await syncClosedTrades(connection, reader(rows), NOW)).toBe("saved");
      expect(saved()).toEqual(["before", "gap"]);
      const where = (db.deleteMany.mock.calls[0] as unknown as [{ where: { closedAt: { lt: Date } } }])[0].where;
      expect(where.closedAt.lt).toEqual(createdAt);
    });

    it("an older connection keeps the exchange-wide moment, so worker records are not doubled", async () => {
      const connection = { id: "c4", userId: "u1", exchange: "bingx", tradesAt: null, createdAt: new Date(CUTOFF - 60 * DAY) };
      const rows = [trade("before", CUTOFF - DAY), trade("watched", CUTOFF + DAY)];
      expect(await syncClosedTrades(connection, reader(rows), NOW)).toBe("saved");
      expect(saved()).toEqual(["before"]);
    });

    it("a connection already imported picks up the missed trades on the weekly read", async () => {
      const connection = {
        id: "c5", userId: "u1", exchange: "bingx", tradesAt: new Date(CUTOFF + 2 * DAY), createdAt: new Date(CUTOFF + DAY),
      };
      expect(await syncClosedTrades(connection, reader([trade("gap", CUTOFF + DAY / 2)]), NOW)).toBe("saved");
      expect(saved()).toEqual(["gap"]);
      expect(db.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("stored estimates at worker start", () => {
    const SEEN = NOW - DAY;
    const estimate = (externalId: string, closedAt = SEEN, entryPrice: string | null = "2227.53") => ({
      connectionId: "c1", externalId, symbol: "ETHUSDT", base: "ETH", settle: "USDT", side: "short",
      size: { toString: () => "9" }, entryPrice: entryPrice === null ? null : { toString: () => entryPrice },
      exitPrice: { toString: () => "2225.99" }, openedAt: new Date(closedAt - 60_000), closedAt: new Date(closedAt),
    });
    const exchange = (closedAt: number, pnl = "-20", entryPrice = "2227.5") => ({
      externalId: "aster:order:1", symbol: "ETHUSDT", base: "ETH", settle: "USDT", side: "short" as const,
      size: "9", entryPrice, exitPrice: "2229", openedAt: closedAt - 60_000, closedAt, pnl,
    });
    const connection = { id: "c1", userId: "u1", exchange: "aster" };

    it("replaces the estimate with the exchange's figure, keeping the row and the moment", async () => {
      db.findMany.mockResolvedValueOnce([estimate("watch:1")]);
      const read = vi.fn(async () => [exchange(SEEN - 10_000)]);
      const corrected = await reconcileEstimatedTrades(
        [connection],
        async () => ({ closedTrades: read }) as unknown as ExchangeAdapter,
        NOW,
      );
      expect(corrected).toBe(1);
      const call = (db.upsert.mock.calls[0] as unknown as [{ where: unknown; update: Record<string, unknown> }])[0];
      expect(call.where).toEqual({ connectionId_externalId: { connectionId: "c1", externalId: "watch:1" } });
      expect(call.update).toMatchObject({ pnl: "-20", pnlUsd: "-20", exact: true, source: "watch", closedAt: new Date(SEEN) });
    });

    it("skips a connection without a history, and one that fails does not stop the next", async () => {
      db.findMany.mockResolvedValueOnce([estimate("watch:1"), { ...estimate("watch:2"), connectionId: "c2" }]);
      const corrected = await reconcileEstimatedTrades(
        [connection, { ...connection, id: "c2" }],
        async (id) => {
          if (id === "c1") throw new Error("key");
          return { closedTrades: async () => [exchange(SEEN - 1_000)] } as unknown as ExchangeAdapter;
        },
        NOW,
      );
      expect(corrected).toBe(1);
      expect(await reconcileEstimatedTrades([], async () => ({}) as ExchangeAdapter, NOW)).toBe(0);
    });

    it("a close stored twice around a restart: the estimate is left out, not given the figure again", async () => {
      db.findMany.mockResolvedValueOnce([
        { ...estimate("watch:old", SEEN - 60_000), id: "exact", exact: true },
        { ...estimate("watch:new", SEEN), id: "double", exact: false },
      ]);
      const read = vi.fn(async () => [exchange(SEEN - 90_000)]);
      const corrected = await reconcileEstimatedTrades(
        [connection],
        async () => ({ closedTrades: read }) as unknown as ExchangeAdapter,
        NOW,
      );
      expect(corrected).toBe(0);
      expect(db.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["double"] } }, data: { excluded: true } });
      expect(db.upsert).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    });

    it("only a one to one match counts", () => {
      const one = estimate("a");
      expect(matchEstimates([one], [exchange(SEEN - 1_000)])).toHaveLength(1);
      // Two trades for one estimate, or one trade for two estimates.
      expect(matchEstimates([one], [exchange(SEEN - 1_000), exchange(SEEN - 2_000)])).toEqual([]);
      expect(matchEstimates([one, estimate("b", SEEN + 1_000)], [exchange(SEEN - 1_000)])).toEqual([]);
      // Too long before the worker saw it, after it, another entry price, another side.
      expect(matchEstimates([one], [exchange(SEEN - 6 * 60_000)])).toEqual([]);
      expect(matchEstimates([one], [exchange(SEEN + 60_000)])).toEqual([]);
      expect(matchEstimates([one], [exchange(SEEN - 1_000, "-20", "2300")])).toEqual([]);
      expect(matchEstimates([one], [{ ...exchange(SEEN - 1_000), side: "long" }])).toEqual([]);
      // No stored entry: coin, side and time decide.
      expect(matchEstimates([estimate("c", SEEN, null)], [exchange(SEEN - 1_000)])).toHaveLength(1);
    });
  });
});
