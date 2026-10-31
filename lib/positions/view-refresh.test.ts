import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncResult } from "@/lib/exchanges/types";

const mocks = vi.hoisted(() => ({
  rows: vi.fn(),
  snapshot: vi.fn(),
  edit: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { exchangeConnection: { findMany: mocks.rows } },
}));
vi.mock("@/lib/services/telegram", () => ({ editWithKeyboard: mocks.edit }));
vi.mock("@/lib/telegram/positions-bot", async (original) => ({
  ...(await original<typeof import("@/lib/telegram/positions-bot")>()),
  positionsSnapshot: mocks.snapshot,
}));
vi.mock("./alert-service", () => ({ WATCHED_STATUSES: ["ACTIVE"] }));

import { refreshPositionView, workerSiteUrl } from "./view-refresh";

const request = { id: "r", userId: "u", chatId: 5, messageId: 7, at: 1 };
const stored = (connectionId: string, exchange: string, base: string) => ({
  connectionId,
  exchange,
  base,
  side: "long",
  leverage: null,
  notionalUsd: "100",
  entryPrice: null,
  markPrice: null,
  liquidationPrice: null,
  margin: null,
  unrealizedPnl: null,
  unrealizedPnlUsd: "1",
});
const result = (base: string): SyncResult => ({
  failedAccounts: [],
  accounts: [
    {
      accountKey: "futures",
      kind: "futures",
      mode: "x",
      equityUsd: null,
      availableUsd: null,
      unrealizedPnlUsd: null,
      complete: true,
      errorCode: null,
      balances: [],
      positions: [
        {
          positionKey: "k",
          symbol: base,
          base,
          settle: "USDT",
          side: "short",
          contracts: "1",
          contractSize: "1",
          baseSize: "1",
          notionalUsd: "200",
          entryPrice: null,
          markPrice: null,
          liquidationPrice: null,
          leverage: null,
          marginMode: null,
          margin: null,
          unrealizedPnl: null,
          unrealizedPnlUsd: "2",
        },
      ],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  mocks.snapshot.mockResolvedValue({
    connections: [
      { id: "a", exchange: "binance", positionsAt: Date.now() - 600_000 },
      { id: "b", exchange: "bybit", positionsAt: Date.now() - 600_000 },
    ],
    positions: [stored("a", "binance", "OLDBTC"), stored("b", "bybit", "OLDETH")],
  });
});

describe("refreshPositionView", () => {
  it("replaces stored positions with fresh ones in one edit of that message", async () => {
    await refreshPositionView(request, async () => ({ result: result("NEW"), at: Date.now() }));
    expect(mocks.edit).toHaveBeenCalledOnce();
    const [chatId, messageId, text] = mocks.edit.mock.calls[0]!;
    expect([chatId, messageId]).toEqual([5, 7]);
    expect(text).not.toContain("OLD");
    expect(text).toContain("шорт");
    expect(text).not.toContain("Не обновились");
    expect(text).not.toContain("назад");
  });

  it("keeps the stored positions of a connection that failed, and says so", async () => {
    await refreshPositionView(request, async (row) =>
      row.id === "a" ? { result: result("NEW"), at: Date.now() } : null,
    );
    const text: string = mocks.edit.mock.calls[0]![2];
    expect(text).not.toContain("OLDBTC");
    expect(text).toContain("OLDETH");
    expect(text).toContain("Не обновились: Bybit");
    expect(text).toContain("10 мин назад");
  });

  it("does not trust a partial read: its stored positions stay", async () => {
    const partial = result("NEW");
    partial.failedAccounts = [{ accountKey: "f", kind: "futures", errorCode: "UNAVAILABLE" }];
    await refreshPositionView(request, async () => ({ result: partial, at: Date.now() }));
    const text: string = mocks.edit.mock.calls[0]![2];
    expect(text).toContain("OLDBTC");
    expect(text).toContain("OLDETH");
  });
});

describe("workerSiteUrl", () => {
  it("prefers the configured site, then the activity URL's origin", () => {
    expect(workerSiteUrl({ NEXT_PUBLIC_APP_URL: "https://a.test/" } as never)).toBe("https://a.test");
    expect(workerSiteUrl({ EXCHANGE_ACTIVITY_URL: "https://b.test/api/worker/activity" } as never)).toBe(
      "https://b.test",
    );
    expect(workerSiteUrl({} as never)).toBeNull();
  });
});
