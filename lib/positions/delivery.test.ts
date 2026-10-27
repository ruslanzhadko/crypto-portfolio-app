import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { formatPositionMessage, type SourcedEvent } from "./delivery";
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
      { kind: "closed", position, pnlUsd: -12.5, source },
      { kind: "liquidation", position, distancePercent: 7.41, source },
      { kind: "pnlSign", position, positive: true, pnlUsd: 4, source },
    ];
    const text = formatPositionMessage(events, new Date("2026-10-27T12:00:00Z"));
    expect(text).toContain("Позиция открыта: BTC LONG ×10");
    expect(text).toContain("Binance &lt;Main&gt; · $7,000 · вход 70000");
    expect(text).toContain("PnL ≈ <b>−$12.50</b> (по последнему опросу)");
    expect(text).toContain("до ликвидации <b>7.4%</b> (цена 54000, ликвидация 50000)");
    expect(text).toContain("Позиция ушла в плюс: BTC LONG ×10");
    expect(text).toContain("PnL <b>+$4.00</b>");
    expect(text.split("\n\n")).toHaveLength(5);
  });
});
