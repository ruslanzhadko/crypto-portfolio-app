import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  formatPositionsMessage,
  positionsKeyboard,
  snapshotStale,
  type BotPosition,
} from "./positions-bot";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

const position = (over: Partial<BotPosition> = {}): BotPosition => ({
  connectionId: "c1",
  exchange: "binance",
  base: "BTC",
  side: "long",
  leverage: "10",
  notionalUsd: "7800",
  entryPrice: "94210",
  markPrice: "100000",
  liquidationPrice: "90000",
  margin: "780",
  unrealizedPnl: "96.2",
  unrealizedPnlUsd: "96.2",
  ...over,
});
const connection = (positionsAt: number | null = NOW - 5_000) => ({
  id: "c1",
  exchange: "binance",
  positionsAt,
});

describe("formatPositionsMessage", () => {
  it("shows the main figures of a position and the total", () => {
    const text = formatPositionsMessage(
      { connections: [connection()], positions: [position()] },
      {},
      NOW,
    );
    expect(text).toContain("Позиции · 1");
    expect(text).toContain("<b>BTC</b> лонг 10x · Binance");
    expect(text).toContain("+96,20 $ (+12,3%)");
    expect(text).toContain("до ликв. 10,0%");
    expect(text).not.toContain("назад");
  });

  it("says how old the data is and that fresh data was requested", () => {
    const text = formatPositionsMessage(
      { connections: [connection(NOW - 12 * 60_000)], positions: [position()] },
      { refreshing: true },
      NOW,
    );
    expect(text).toContain("12 мин назад");
    expect(text).toContain("Запросил свежие данные");
  });

  it("leaves out figures that are unknown instead of showing zero", () => {
    const text = formatPositionsMessage(
      {
        connections: [connection()],
        positions: [
          position({
            leverage: null,
            margin: null,
            notionalUsd: null,
            liquidationPrice: null,
            unrealizedPnl: null,
            unrealizedPnlUsd: null,
          }),
        ],
      },
      {},
      NOW,
    );
    expect(text).toContain("⚪");
    expect(text).toContain("PnL неизвестен");
    expect(text).not.toContain("uPnL");
    expect(text).not.toContain("до ликв.");
    expect(text).not.toContain("размер");
  });

  it("sorts by size, stays within the Telegram limit and counts the rest", () => {
    const positions = Array.from({ length: 30 }, (_, i) =>
      position({ base: `COIN${i}`, notionalUsd: String(i) }),
    );
    const text = formatPositionsMessage({ connections: [connection()], positions }, {}, NOW);
    expect(text.indexOf("COIN29")).toBeLessThan(text.indexOf("COIN28"));
    expect(text).toContain("…и ещё 10");
    expect(text).not.toContain("COIN5 ");
    expect(text.length).toBeLessThan(4096);
  });

  it("escapes coin names and names exchanges that did not refresh", () => {
    const text = formatPositionsMessage(
      { connections: [connection()], positions: [position({ base: "<b>" })] },
      { failed: ["bybit"] },
      NOW,
    );
    expect(text).toContain("&lt;b&gt;");
    expect(text).toContain("Не обновились: Bybit");
  });

  it("explains empty states", () => {
    expect(formatPositionsMessage({ connections: [], positions: [] }, {}, NOW)).toContain("не подключены");
    expect(formatPositionsMessage({ connections: [connection()], positions: [] }, {}, NOW)).toContain(
      "Открытых позиций нет",
    );
  });
});

describe("snapshotStale", () => {
  it("is stale when any connection is old or was never read", () => {
    const stale = (at: number | null) =>
      snapshotStale({ connections: [connection(), connection(at)], positions: [] }, NOW);
    expect(stale(NOW - 30_000)).toBe(false);
    expect(stale(NOW - 60_000)).toBe(true);
    expect(stale(null)).toBe(true);
  });
});

describe("positionsKeyboard", () => {
  it("has the refresh button, and the site link when the site is known", () => {
    expect(positionsKeyboard(null)[0]).toHaveLength(1);
    expect(positionsKeyboard("https://x.test")[0]![1]!.url).toBe("https://x.test/ru/positions");
  });
});
