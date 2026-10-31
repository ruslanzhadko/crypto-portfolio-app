import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { closedTrade: db } }));
vi.mock("./pricing", () => ({
  settlementPrices: async () => new Map([["USDT", "1"]]),
}));

import { reconcileEstimatedTrades } from "./closed-trades";

const NOW = Date.UTC(2026, 9, 31, 17);
const seenAt = NOW - 30 * 60_000;
const stored = (over: object) => ({
  id: "r1",
  connectionId: "c1",
  externalId: "watch:f:ENSO:1",
  symbol: "ENSO-USDT",
  base: "ENSO",
  settle: "USDT",
  side: "long",
  size: "2000",
  entryPrice: "0.5439",
  exitPrice: "0.5453",
  openedAt: new Date(seenAt - 94 * 60_000),
  closedAt: new Date(seenAt),
  pnl: "-0.61",
  exact: true,
  excluded: false,
  ...over,
});
const realTrade = {
  externalId: "bingx:order:1",
  symbol: "ENSO-USDT",
  base: "ENSO",
  settle: "USDT",
  side: "long" as const,
  size: "2022",
  entryPrice: "0.5441",
  exitPrice: "0.5442",
  openedAt: seenAt - 92 * 60_000,
  closedAt: seenAt - 2 * 60_000,
  pnl: "-0.70",
};
const connection = { id: "c1", userId: "u1", exchange: "bingx" };
const adapter = (trades: unknown[]) => async () =>
  ({ closedTrades: async () => trades }) as never;

beforeEach(() => vi.clearAllMocks());

describe("reconcileEstimatedTrades", () => {
  it("corrects an exact row's prices and times, keeping its result and id", async () => {
    db.findMany.mockResolvedValue([stored({})]);
    expect(await reconcileEstimatedTrades([connection], adapter([realTrade]), NOW)).toBe(0);
    const { where, update } = db.upsert.mock.calls[0]![0];
    expect(where.connectionId_externalId.externalId).toBe("watch:f:ENSO:1");
    expect(update).toMatchObject({
      pnl: "-0.61",
      entryPrice: "0.5441",
      exitPrice: "0.5442",
      size: "2022",
      exact: true,
    });
    expect(update.closedAt.getTime()).toBe(realTrade.closedAt);
    expect(update.openedAt.getTime()).toBe(realTrade.openedAt);
  });

  it("gives an estimate the exchange's result too", async () => {
    db.findMany.mockResolvedValue([stored({ exact: false })]);
    expect(await reconcileEstimatedTrades([connection], adapter([realTrade]), NOW)).toBe(1);
    expect(db.upsert.mock.calls[0]![0].update).toMatchObject({ pnl: "-0.70", exact: true });
  });

  it("leaves a row alone when no trade matches, or it is excluded", async () => {
    db.findMany.mockResolvedValue([stored({})]);
    await reconcileEstimatedTrades([connection], adapter([{ ...realTrade, side: "short" }]), NOW);
    db.findMany.mockResolvedValue([stored({ excluded: true })]);
    await reconcileEstimatedTrades([connection], adapter([realTrade]), NOW);
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
