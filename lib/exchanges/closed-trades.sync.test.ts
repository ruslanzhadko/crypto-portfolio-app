import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({})),
  deleteMany: vi.fn(async () => ({ count: 0 })),
  update: vi.fn(async () => ({})),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    closedTrade: { upsert: db.upsert, deleteMany: db.deleteMany },
    exchangeConnection: { update: db.update },
  },
}));
vi.mock("./pricing", () => ({ settlementPrices: async () => new Map([["USDT", "1"]]) }));
import { syncClosedTrades } from "./closed-trades";
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
});
