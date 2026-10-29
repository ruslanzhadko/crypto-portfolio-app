import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { commandOf, formatStatsMessage, parseStatsCallback, statsKeyboard } from "./stats-bot";
import type { StatsTrade } from "@/lib/positions/trade-stats";

const now = Date.UTC(2026, 9, 29, 12);
const trade = (over: Partial<StatsTrade>): StatsTrade => ({
  id: "t", connectionId: "c", exchange: "bingx", label: "Main", symbol: "AXIS-USDT", base: "AXIS", side: "short",
  size: null, entryPrice: null, exitPrice: null, openedAt: null, closedAt: now - 3_600_000, pnlUsd: 104.67, exact: true,
  ...over,
});

describe("statistics in the bot", () => {
  it("reads commands with a bot name and period buttons", () => {
    expect(commandOf("/stats@cryptoportfolio_bot extra")).toBe("/stats");
    expect(parseStatsCallback("stats:7d")).toBe("7d");
    expect(parseStatsCallback("stats:1y")).toBeNull();
    expect(parseStatsCallback(undefined)).toBeNull();
  });

  it("formats the period with result, wins, extremes and breakdowns", () => {
    const text = formatStatsMessage(
      "7d",
      [trade({}), trade({ id: "b", base: "BULL", side: "long", exchange: "gate", pnlUsd: -12.3 })],
      now,
    );
    expect(text.split("\n")).toEqual([
      "📊 <b>Статистика торговли · 7 дней</b>",
      "",
      "🟢 Итог: <b>+92,37 $</b>",
      "Сделок: 2 — 1 ✅ / 1 ❌ (50%)",
      "Средняя прибыль +104,67 $ · средний убыток −12,30 $",
      "Лучшая: AXIS шорт +104,67 $ (BingX)",
      "Худшая: BULL лонг −12,30 $ (Gate)",
      "По биржам: BingX +104,67 $ · Gate −12,30 $",
      "Монеты: AXIS +104,67 $ · BULL −12,30 $",
    ]);
    expect(formatStatsMessage("today", [], now)).toContain("Закрытых сделок за этот период нет.");
  });

  it("marks the active period and links to the site", () => {
    const keyboard = statsKeyboard("30d", "https://example.com");
    expect(keyboard[0]!.map((b) => [b.text, b.callback_data])).toEqual([
      ["Сегодня", "stats:today"], ["7 дней", "stats:7d"], ["• 30 дней •", "stats:30d"], ["Всё", "stats:all"],
    ]);
    expect(keyboard[1]).toEqual([{ text: "Открыть на сайте", url: "https://example.com/ru/positions?tab=stats" }]);
    expect(statsKeyboard("today", null)).toHaveLength(1);
  });
});
