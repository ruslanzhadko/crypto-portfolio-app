import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  exchangesEnabled: vi.fn(),
  connections: vi.fn(),
  transfers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api/auth-guard", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/exchanges/config", () => ({ exchangesEnabled: mocks.exchangesEnabled }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    exchangeConnection: { findMany: mocks.connections },
    exchangeTransfer: { findMany: mocks.transfers },
  },
}));

import { GET } from "./route";

const decimal = (value: string) => ({ toFixed: () => value });
const row = (id: string, minutesAgo: number) => ({
  id,
  connectionId: "binance-1",
  direction: "deposit",
  asset: "USDT",
  network: "BSC",
  amount: decimal("100.5"),
  fee: null,
  txHash: `0x${"c".repeat(64)}`,
  status: "completed",
  occurredAt: new Date(Date.UTC(2026, 9, 25, 12) - minutesAgo * 60_000),
});

describe("exchange transfers for the dashboard list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue({ ok: true, user: { id: "user" } });
    mocks.exchangesEnabled.mockReturnValue(true);
    mocks.connections.mockResolvedValue([
      { id: "binance-1", exchange: "binance", label: "Main", transfersError: null },
      { id: "gate-1", exchange: "gate", label: "Gate main", transfersError: "IP_RESTRICTED" },
    ]);
  });

  it("returns the user's latest transfers with chain, link and unavailable accounts", async () => {
    mocks.transfers.mockResolvedValue([row("a", 1), row("b", 2), row("c", 3), row("d", 4), row("e", 5), row("f", 6)]);
    const res = await GET(new Request("https://example.com/api/exchanges/transfers?limit=5"));
    const body = await res.json();

    expect(mocks.connections.mock.calls[0]![0].where).toEqual({ userId: "user", status: { not: "DISCONNECTED" } });
    expect(mocks.transfers.mock.calls[0]![0]).toMatchObject({
      where: { connectionId: { in: ["binance-1", "gate-1"] } },
      take: 6,
    });
    expect(body.transfers).toHaveLength(5);
    expect(body.hasMore).toBe(true);
    expect(body.transfers[0]).toMatchObject({
      exchange: "binance",
      accountLabel: "Main",
      chain: "bsc",
      amount: "100.5",
      explorerUrl: `https://bscscan.com/tx/0x${"c".repeat(64)}`,
    });
    expect(body.unavailable).toEqual(["Gate main"]);
  });

  it("is hidden from users outside the exchange pilot", async () => {
    mocks.exchangesEnabled.mockReturnValue(false);
    const res = await GET(new Request("https://example.com/api/exchanges/transfers"));
    expect(res.status).toBe(404);
    expect(mocks.connections).not.toHaveBeenCalled();
  });

  it("skips the transfer query when the user has no accounts", async () => {
    mocks.connections.mockResolvedValue([]);
    const body = await (await GET(new Request("https://example.com/api/exchanges/transfers"))).json();
    expect(body).toMatchObject({ transfers: [], hasMore: false, accounts: [] });
    expect(mocks.transfers).not.toHaveBeenCalled();
  });
});
