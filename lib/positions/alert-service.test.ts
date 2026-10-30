import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExchangeError,
  type OpenPosition,
  type SyncResult,
} from "@/lib/exchanges/types";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  exchangeConnection: { findMany: vi.fn() },
  exchangePosition: { findMany: vi.fn() },
  closedTrade: { findMany: vi.fn() },
}));
const adapter = vi.hoisted(() => ({
  verify: vi.fn(),
  fetch: vi.fn(),
  closedResult: vi.fn(),
  closedTrades: vi.fn(),
}));
const deliver = vi.hoisted(() => vi.fn());
const revise = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/exchanges/config", () => ({ exchangesEnabled: () => true }));
vi.mock("@/lib/exchanges/worker", () => ({
  clientVersion: () => null,
  connectionClient: async () => ({ adapter, touched: 0, version: 1 }),
}));
vi.mock("./delivery", () => ({ deliverPositionEvents: deliver, reviseDeliveredEvent: revise }));
const saveTrades = vi.hoisted(() => vi.fn());
const importTrades = vi.hoisted(() => vi.fn());
const reconcile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/exchanges/closed-trades", () => ({
  reconcileEstimatedTrades: reconcile,
  HISTORY_EXCHANGES: new Set(["bybit", "gate", "bingx", "kucoin"]),
  saveClosedTrades: saveTrades,
  syncClosedTrades: importTrades,
}));
import { ALERT_POLL_MS, PositionAlertService } from "./alert-service";

const settings = {
  opened: true,
  closed: true,
  pnlSign: false,
  liquidation: false,
  liquidationPercent: 10,
  excludedConnections: ["skipped"],
};
const row = (id: string, lastSuccessAt: Date | null = new Date(0)) => ({
  id,
  userId: "u1",
  label: `Main ${id}`,
  exchange: "binance",
  credentialVersion: 1,
  lastSuccessAt,
});
const btc: OpenPosition = {
  positionKey: "BTCUSDT:BOTH",
  symbol: "BTCUSDT",
  base: "BTC",
  settle: "USDT",
  side: "long",
  contracts: "1",
  contractSize: "1",
  baseSize: "1",
  notionalUsd: "70000",
  entryPrice: "70000",
  markPrice: "70000",
  liquidationPrice: null,
  leverage: "5",
  marginMode: "cross",
  margin: "14000",
  unrealizedPnl: "0",
  unrealizedPnlUsd: "0",
};
const result = (...positions: OpenPosition[]): SyncResult => ({
  accounts: [
    {
      accountKey: "futures",
      kind: "futures",
      mode: "classic",
      equityUsd: null,
      availableUsd: null,
      unrealizedPnlUsd: null,
      complete: true,
      errorCode: null,
      balances: [],
      positions,
    },
  ],
  failedAccounts: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.user.findMany.mockResolvedValue([{ id: "u1", positionAlerts: settings }]);
  db.exchangeConnection.findMany.mockResolvedValue([row("c1"), row("skipped")]);
  // BTC was open before the restart: it must not be reported as just opened.
  db.exchangePosition.findMany.mockResolvedValue([
    {
      ...btc,
      side: "long",
      baseSize: { toString: () => "1" },
      notionalUsd: null,
      entryPrice: null,
      markPrice: null,
      liquidationPrice: null,
      leverage: null,
      margin: null,
      unrealizedPnlUsd: { toString: () => "25" },
      account: { connectionId: "c1", accountKey: "futures" },
    },
  ]);
  deliver.mockResolvedValue("sent");
  saveTrades.mockResolvedValue(undefined);
  revise.mockResolvedValue(undefined);
  db.closedTrade.findMany.mockResolvedValue([]);
});

describe("PositionAlertService", () => {
  it("watches non-excluded connections and reports changes against the stored positions", async () => {
    const service = new PositionAlertService();
    expect(await service.maybeReload(null, 0)).toBe(true);
    expect(service.size).toBe(1);
    expect(await service.maybeReload(null, 1000)).toBe(false);

    adapter.fetch.mockResolvedValue(result());
    await service.pollDue(10_000);
    expect(adapter.verify).toHaveBeenCalledTimes(1);
    expect(adapter.fetch).toHaveBeenCalledWith(false);
    await service.resolveClosed(10_000);
    expect(await service.flush()).toEqual(["u1"]);
    expect(deliver).toHaveBeenCalledWith("u1", [
      expect.objectContaining({
        kind: "closed",
        pnlUsd: 25,
        source: { label: "Main c1", exchange: "binance" },
      }),
    ]);
    expect(await service.flush()).toEqual([]);
  });

  it("does not poll again while a sync job's result is fresh", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    service.observe({ id: "c1", userId: "u1" }, result(btc), Date.now());
    await service.pollDue(Date.now());
    expect(adapter.fetch).not.toHaveBeenCalled();
  });

  it("slows down an exchange that answers with a rate limit", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    adapter.fetch.mockRejectedValueOnce(new ExchangeError("RATE_LIMIT"));
    const start = Date.now();
    await service.pollDue(start);
    await service.pollDue(start + ALERT_POLL_MS + 1000);
    expect(adapter.fetch).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh base when the key is replaced instead of reporting positions closed", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    const old = { ...btc, positionKey: "98000003122518_BTCUSDT_LONG" };
    service.observe(
      { id: "c1", userId: "u1", credentialVersion: 1 },
      result(old),
      1000,
    );
    expect(await service.flush()).toEqual(["u1"]); // the stored base differs from the first poll
    deliver.mockClear();
    // Same position read through the API under another key after the key was replaced.
    service.observe(
      { id: "c1", userId: "u1", credentialVersion: 2 },
      result(btc),
      2000,
    );
    expect(await service.flush()).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("waits for the exchange ledger and sends the exact closed result", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    const since = 1_000;
    const open = {
      ...btc,
      unrealizedPnl: "10",
      unrealizedPnlUsd: "9.9",
      funding: {
        amount: "0",
        realizedPnl: "0",
        tradingFees: "0",
        since,
        updatedAt: since,
        status: "complete" as const,
      },
    };
    service.observe({ id: "c1", userId: "u1" }, result(open), 100_000);
    await service.flush();
    deliver.mockClear();
    service.observe({ id: "c1", userId: "u1" }, result(), 115_000);
    // Nothing goes out before the ledger is read.
    expect(await service.flush()).toEqual([]);
    adapter.closedResult
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("-21");
    await service.resolveClosed(135_000); // not in the ledger yet
    expect(await service.flush()).toEqual([]);
    await service.resolveClosed(155_000);
    expect(await service.flush()).toEqual(["u1"]);
    expect(adapter.closedResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        symbol: "BTCUSDT",
        since,
        lastSeenAt: 100_000,
        otherLeg: false,
      }),
    );
    const [, events] = deliver.mock.calls[0]!;
    // -21 USDT at the position's PnL rate 0.99.
    expect(events[0]).toMatchObject({
      kind: "closed",
      exact: true,
      includesCosts: true,
    });
    expect(events[0].pnlUsd).toBeCloseTo(-20.79, 6);
  });

  it("keeps the estimate when the ledger never confirms the close", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    const open = {
      ...btc,
      funding: {
        amount: "0",
        realizedPnl: "0",
        tradingFees: "0",
        since: 1_000,
        updatedAt: 1_000,
        status: "complete" as const,
      },
    };
    service.observe({ id: "c1", userId: "u1" }, result(open), 100_000);
    await service.flush();
    deliver.mockClear();
    service.observe({ id: "c1", userId: "u1" }, result(), 115_000);
    adapter.closedResult.mockResolvedValue(null);
    await service.resolveClosed(115_000 + 2 * 60_000);
    expect(await service.flush()).toEqual(["u1"]);
    expect(deliver.mock.calls[0]![1][0]).toMatchObject({
      kind: "closed",
      pnlUsd: 0,
    });
    expect(deliver.mock.calls[0]![1][0].exact).toBeUndefined();
  });

  it("treats the first read of a never-synced connection as the base, not as opened positions", async () => {
    db.exchangeConnection.findMany.mockResolvedValue([row("c1", null)]);
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    service.observe({ id: "c1", userId: "u1" }, result(btc), 1000);
    expect(await service.flush()).toEqual([]);
    expect(db.exchangePosition.findMany).not.toHaveBeenCalled();
  });

  it("reloads when the site signals a settings change", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(5, 0);
    expect(await service.maybeReload(5, 1000)).toBe(false);
    db.user.findMany.mockResolvedValue([]);
    expect(await service.maybeReload(6, 2000)).toBe(true);
    expect(service.size).toBe(0);
  });

  it("treats the first signal as a change when none existed at startup", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    expect(await service.maybeReload(7, 1000)).toBe(true);
  });

  it("records closes for statistics without alerts, and skips exchanges with a position history", async () => {
    db.user.findMany.mockResolvedValue([]);
    db.exchangeConnection.findMany.mockResolvedValue([row("c1")]);
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    // Record-only connections are not polled.
    expect(service.size).toBe(0);
    service.observe({ id: "c1", userId: "u1" }, result(), 5_000);
    await service.resolveClosed(5_000);
    expect(saveTrades).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      [expect.objectContaining({ symbol: "BTCUSDT", side: "long", pnl: "25", closedAt: 5_000 })],
      "watch",
      false,
      expect.any(Function),
    );
    expect(await service.flush()).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
    // The where clause asks for alert users' connections or exchanges without a history.
    const where = db.exchangeConnection.findMany.mock.calls[0]![0].where;
    expect(where.OR[1]).toEqual({ exchange: { notIn: ["bybit", "gate", "bingx", "kucoin"] } });
  });

  it("an excluded connection still feeds the statistics", async () => {
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    service.observe({ id: "skipped", userId: "u1" }, result(btc), 1_000);
    service.observe({ id: "skipped", userId: "u1" }, result(), 2_000);
    await Promise.resolve();
    expect(saveTrades).toHaveBeenCalledTimes(1);
    expect(await service.flush()).toEqual([]);
  });

  it("reads the position history a minute after a close on an exchange that has one", async () => {
    db.exchangeConnection.findMany.mockResolvedValue([{ ...row("c1"), exchange: "bybit" }]);
    const service = new PositionAlertService();
    await service.maybeReload(null, 0);
    service.observe({ id: "c1", userId: "u1" }, result(), 10_000);
    await service.importClosed(30_000);
    expect(importTrades).not.toHaveBeenCalled();
    await service.importClosed(70_000);
    expect(importTrades).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), adapter, 70_000, true);
    // Not recorded by the worker itself: the exchange history is the source there.
    expect(saveTrades).not.toHaveBeenCalled();
  });

  it("checks stored estimates once per start, after the connections are loaded", async () => {
    const service = new PositionAlertService();
    expect(await service.reconcileEstimates(1)).toBe(false);
    await service.maybeReload(null, 0);
    expect(await service.reconcileEstimates(1)).toBe(true);
    expect(await service.reconcileEstimates(2)).toBe(false);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  describe("final result after an estimate", () => {
    const MIN = 60_000;
    const shortLived: OpenPosition = { ...btc, unrealizedPnl: "22.68", unrealizedPnlUsd: "22.68" };
    const trade = (closedAt: number, pnl = "-20") => ({ base: "BTC", settle: "USDT", side: "long", closedAt, pnl });
    /** Position seen at 10 s and gone at 25 s, with no known cycle start; the alert went out. */
    async function closedEstimate() {
      adapter.closedResult.mockResolvedValue(null);
      const service = new PositionAlertService();
      await service.maybeReload(null, 0);
      service.observe({ id: "c1", userId: "u1" }, result(shortLived), 10_000);
      service.observe({ id: "c1", userId: "u1" }, result(), 25_000);
      deliver.mockResolvedValue({ status: "sent", sentAt: new Date(25_000), telegram: { chatId: "1", messageId: 7 } });
      await service.flush();
      deliver.mockClear();
      saveTrades.mockClear();
      return service;
    }

    it("corrects the alert and the statistics with the figure from fills", async () => {
      const service = await closedEstimate();
      adapter.closedTrades.mockResolvedValue([trade(20_000)]);
      expect(await service.recheckClosed(MIN)).toBe(false);
      expect(adapter.closedTrades).not.toHaveBeenCalled();

      expect(await service.recheckClosed(25_000 + 2 * MIN)).toBe(true);
      expect(revise).toHaveBeenCalledTimes(1);
      const [userId, event] = revise.mock.calls[0]!;
      expect(userId).toBe("u1");
      expect(event).toMatchObject({ pnlUsd: -20, exact: true, includesCosts: true, withoutFunding: true });
      expect(saveTrades).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c1" }),
        [expect.objectContaining({ pnl: "-20", closedAt: 25_000 })],
        "watch",
        true,
        expect.any(Function),
      );
      // Done: nothing is read or edited again.
      adapter.closedTrades.mockClear();
      expect(await service.recheckClosed(25_000 + 30 * MIN)).toBe(false);
      expect(adapter.closedTrades).not.toHaveBeenCalled();
    });

    it("keeps trying until the last check, then leaves the estimate", async () => {
      const service = await closedEstimate();
      adapter.closedTrades.mockResolvedValue([]);
      await service.recheckClosed(25_000 + 2 * MIN);
      await service.recheckClosed(25_000 + 10 * MIN);
      await service.recheckClosed(25_000 + 30 * MIN);
      expect(adapter.closedTrades).toHaveBeenCalledTimes(3);
      await service.recheckClosed(25_000 + 60 * MIN);
      expect(adapter.closedTrades).toHaveBeenCalledTimes(3);
      expect(revise).not.toHaveBeenCalled();
    });

    it("does not guess between two trades, or take one outside the polls around the close", async () => {
      const service = await closedEstimate();
      adapter.closedTrades.mockResolvedValueOnce([trade(15_000), trade(20_000)]);
      expect(await service.recheckClosed(25_000 + 2 * MIN)).toBe(false);
      adapter.closedTrades.mockResolvedValueOnce([trade(25_000 + 5 * MIN)]);
      expect(await service.recheckClosed(25_000 + 10 * MIN)).toBe(false);
      expect(revise).not.toHaveBeenCalled();
    });

    it("a close found right after a restart goes out as an estimate and is corrected later", async () => {
      const service = new PositionAlertService();
      await service.maybeReload(null, 0);
      const seenAt = 20 * MIN;
      service.observe({ id: "c1", userId: "u1" }, result(), seenAt);
      await service.resolveClosed(seenAt);
      expect(saveTrades).toHaveBeenCalledTimes(1);
      deliver.mockResolvedValue({ status: "sent", sentAt: new Date(seenAt), telegram: { chatId: "1", messageId: 7 } });
      expect(await service.flush()).toEqual(["u1"]);
      adapter.closedTrades.mockResolvedValue([trade(seenAt - 2 * MIN, "1.18")]);
      expect(await service.recheckClosed(seenAt + 2 * MIN)).toBe(true);
      expect(revise.mock.calls[0]![1]).toMatchObject({ pnlUsd: 1.18, exact: true });
    });

    it("a close the old worker already stored gets no second trade and no second alert", async () => {
      db.closedTrade.findMany.mockResolvedValue([{ entryPrice: { toString: () => "70000" } }]);
      const service = new PositionAlertService();
      await service.maybeReload(null, 0);
      service.observe({ id: "c1", userId: "u1" }, result(), 20 * MIN);
      await service.resolveClosed(20 * MIN);
      expect(saveTrades).not.toHaveBeenCalled();
      expect(await service.flush()).toEqual([]);
      expect(await service.recheckClosed(22 * MIN)).toBe(false);
    });
  });
});
