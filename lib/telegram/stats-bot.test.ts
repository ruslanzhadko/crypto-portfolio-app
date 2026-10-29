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

  it("formats the period in sections with collapsible coin and trade lists", () => {
    const text = formatStatsMessage(
      "7d",
      [trade({}), trade({ id: "b", base: "BULL", side: "long", exchange: "gate", pnlUsd: -12.3, closedAt: now - 86_400_000 })],
      now,
    );
    expect(text.split("\n\n")).toEqual([
      "📊 <b>Статистика торговли · 7 дней</b>",
      [
        "🟢 Итог: <b>+92,37 $</b>",
        "🔢 2 сделки: ✅ 1 · ❌ 1 · 50% в плюсе",
        "📈 Средняя прибыль: +104,67 $",
        "📉 Средний убыток: −12,30 $",
      ].join("\n"),
      "🏆 Лучшая: <b>AXIS</b> шорт +104,67 $ · BingX\n💔 Худшая: <b>BULL</b> лонг −12,30 $ · Gate",
      "<b>По биржам</b>\n• BingX: +104,67 $ · 1 сделка\n• Gate: −12,30 $ · 1 сделка",
      "<b>По монетам</b> (2)\n<blockquote expandable>🟢 AXIS: +104,67 $ · 1 сделка\n🔴 BULL: −12,30 $ · 1 сделка</blockquote>",
      "<b>Сделки</b> (2)\n<blockquote expandable>🟢 29.10 13:00 AXIS шорт +104,67 $ · BingX\n🔴 28.10 14:00 BULL лонг −12,30 $ · Gate</blockquote>",
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
