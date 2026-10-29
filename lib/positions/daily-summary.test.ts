import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/telegram", () => ({ sendTelegramHtml: vi.fn(), TelegramError: Error }));
import { formatDailySummary } from "./daily-summary";

describe("daily summary", () => {
  it("sums the day with best, worst, exchanges and estimates", () => {
    const text = formatDailySummary(
      "2026-10-29",
      [
        { base: "AXIS", side: "short", exchange: "bingx", pnlUsd: 104.67, exact: true },
        { base: "BULL", side: "long", exchange: "gate", pnlUsd: -12.3, exact: true },
        { base: "SOL", side: "long", exchange: "aster", pnlUsd: 34.67, exact: false },
      ],
      "https://example.com/ru/positions?tab=stats",
    );
    expect(text.split("\n")).toEqual([
      "🟢 <b>Итог за 29.10: +127,04 $</b>",
      "Сделок: 3 — 2 ✅ / 1 ❌",
      "Лучшая: AXIS шорт +104,67 $ (BingX)",
      "Худшая: BULL лонг −12,30 $ (Gate)",
      "По биржам: BingX +104,67 $ · Aster +34,67 $ · Gate −12,30 $",
      "≈ у 1 из 3 — оценка по последнему опросу",
      '<a href="https://example.com/ru/positions?tab=stats">Статистика торговли</a>',
    ]);
  });

  it("is red for a losing day and escapes coin names", () => {
    const text = formatDailySummary("2026-10-29", [{ base: "<B>", side: "long", exchange: "bybit", pnlUsd: -5, exact: true }], null);
    expect(text).toContain("🔴 <b>Итог за 29.10: −5,00 $</b>");
    expect(text).toContain("&lt;B&gt;");
    expect(text).not.toContain("Лучшая");
  });
});
