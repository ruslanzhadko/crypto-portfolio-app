import { describe, expect, it, vi } from "vitest";
const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const edit = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { notificationLog: { updateMany } } }));
vi.mock("@/lib/services/telegram", async (original) => ({
  ...(await original<typeof import("@/lib/services/telegram")>()),
  editTelegramHtml: edit,
}));
import { formatPositionMessage, reviseDeliveredEvent, type SourcedEvent } from "./delivery";
import type { WatchedPosition } from "./watch";

const position: WatchedPosition = {
  accountKey: "futures",
  positionKey: "BTCUSDT:BOTH",
  symbol: "BTCUSDT",
  base: "BTC",
  settle: "USDT",
  side: "long",
  baseSize: "0.1",
  notionalUsd: "7000.4",
  entryPrice: "70000",
  markPrice: "54000",
  liquidationPrice: "50000",
  leverage: "10",
  margin: "700",
  unrealizedPnlUsd: "-12.5",
};
const source = { label: "Binance <Main>", exchange: "binance" };

describe("formatPositionMessage", () => {
  it("puts several events into one message with escaped labels", () => {
    const events: SourcedEvent[] = [
      { kind: "opened", position, source },
      {
        kind: "closed",
        position,
        pnlUsd: -12.5,
        includesCosts: true,
        durationMs: 3 * 3600_000 + 12 * 60_000,
        source,
      },
      { kind: "liquidation", position, distancePercent: 7.41, source },
      { kind: "pnlSign", position, positive: true, pnlUsd: 4, source },
    ];
    const text = formatPositionMessage(
      events,
      new Date("2026-10-27T12:00:00Z"),
    );
    expect(text).toContain("Позиция открыта: BTC LONG ×10");
    expect(text).toContain("Binance &lt;Main&gt; · $7,000 · вход 70000");
    expect(text).toContain("🔴 <b>Позиция закрыта: BTC LONG ×10</b>");
    expect(text).toContain("итог ≈ <b>−$12.50</b> с фандингом и комиссиями");
    expect(text).toContain("⏳ 3 ч 12 мин");
    // Size and the price move from entry to the last mark.
    expect(text).toContain("📏 $7,000 · цена 70000 → 54000 (−22.9%)");
    expect(text).toContain("🔵 <b>Позиция открыта");
    expect(text).toContain(
      "до ликвидации <b>7.4%</b> (цена 54000, ликвидация 50000)",
    );
    expect(text).toContain("Позиция ушла в плюс: BTC LONG ×10");
    expect(text).toContain("PnL <b>+$4.00</b>");
    expect(text.split("\n\n")).toHaveLength(5);
    expect(text).not.toContain("по последнему опросу");
  });
});

describe("reviseDeliveredEvent", () => {
  it("rewrites the sent message and the log row with the final figure", async () => {
    const event: Extract<SourcedEvent, { kind: "closed" }> = {
      kind: "closed",
      position,
      pnlUsd: -20,
      includesCosts: true,
      exact: true,
      withoutFunding: true,
      durationMs: 60_000,
      source,
    };
    const sentAt = new Date("2026-10-30T13:31:31Z");
    await reviseDeliveredEvent("u1", event, [event], {
      status: "sent",
      sentAt,
      telegram: { chatId: "42", messageId: 7 },
    });
    expect(edit).toHaveBeenCalledWith("42", 7, expect.stringContaining("🔴"));
    const text = (edit.mock.calls[0] as unknown as [string, number, string])[2];
    expect(text).toContain("итог <b>−$20.00</b> с комиссиями");
    expect(text).not.toContain("≈");
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: "u1", kind: "closed", sentAt, tokenSymbol: "BTC" }),
      data: expect.objectContaining({
        message: expect.stringContaining("итог −$20.00"),
        details: expect.objectContaining({ pnlUsd: -20, approximate: false }),
      }),
    });
  });
});
