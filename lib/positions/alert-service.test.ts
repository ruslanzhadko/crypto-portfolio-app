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
}));
const adapter = vi.hoisted(() => ({ verify: vi.fn(), fetch: vi.fn() }));
const deliver = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/exchanges/config", () => ({ exchangesEnabled: () => true }));
vi.mock("@/lib/exchanges/worker", () => ({
  clientVersion: () => null,
  connectionClient: async () => ({ adapter, touched: 0, version: 1 }),
}));
vi.mock("./delivery", () => ({ deliverPositionEvents: deliver }));
import { ALERT_POLL_MS, PositionAlertService } from "./alert-service";

const settings = {
  opened: true,
  closed: true,
  pnlSign: false,
  liquidation: false,
  liquidationPercent: 10,
  excludedConnections: ["skipped"],
};
const row = (id: string) => ({
  id,
  userId: "u1",
  label: `Main ${id}`,
  exchange: "binance",
  credentialVersion: 1,
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
});
