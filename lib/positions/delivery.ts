import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  escapeHtml,
  formatKyivTime,
  sendTelegramHtml,
  TelegramError,
} from "@/lib/services/telegram";
import type { PositionEvent } from "./watch";

/** Where an event happened: the connection's label and exchange. */
export type EventSource = { label: string; exchange: string };
export type SourcedEvent = PositionEvent & { source: EventSource };

/** What the alert log stores for a position event; the site renders it in the viewer's language. */
export type PositionLogDetails = {
  exchange: string;
  label: string;
  side: "long" | "short";
  leverage: string | null;
  sizeUsd: string | null;
  pnlUsd?: number | null;
  /** Closed PnL from the last poll, not from the exchange history. */
  approximate?: boolean;
  distancePercent?: number;
  positive?: boolean;
};

const usd = (value: number) =>
  `${value < 0 ? "−" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const plainUsd = (value: string | null) =>
  value === null
    ? null
    : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function title(e: SourcedEvent) {
  const p = e.position;
  const leverage = p.leverage ? ` ×${Number(p.leverage)}` : "";
  return `${escapeHtml(p.base)} ${p.side === "long" ? "LONG" : "SHORT"}${leverage}`;
}

/** One event as a few lines of Telegram HTML (Russian, like the price alerts). */
export function formatPositionEvent(e: SourcedEvent): string {
  const p = e.position;
  const where = escapeHtml(e.source.label);
  switch (e.kind) {
    case "opened":
      return [
        `🟢 <b>Позиция открыта: ${title(e)}</b>`,
        [where, plainUsd(p.notionalUsd), p.entryPrice && `вход ${Number(p.entryPrice)}`]
          .filter(Boolean)
          .join(" · "),
      ].join("\n");
    case "closed":
      return [
        `⚪️ <b>Позиция закрыта: ${title(e)}</b>`,
        e.pnlUsd === null
          ? where
          : `${where} · PnL ≈ <b>${usd(e.pnlUsd)}</b> (по последнему опросу)`,
      ].join("\n");
    case "liquidation":
      return [
        `⚠️ <b>Близко к ликвидации: ${title(e)}</b>`,
        `${where} · до ликвидации <b>${e.distancePercent.toFixed(1)}%</b> (цена ${Number(p.markPrice)}, ликвидация ${Number(p.liquidationPrice)})`,
      ].join("\n");
    case "pnlSign":
      return [
        `${e.positive ? "📈" : "📉"} <b>Позиция ушла в ${e.positive ? "плюс" : "минус"}: ${title(e)}</b>`,
        `${where} · PnL <b>${usd(e.pnlUsd)}</b>`,
      ].join("\n");
  }
}

/** Several events from one poll go out as one message. */
export function formatPositionMessage(events: SourcedEvent[], at = new Date()): string {
  return [...events.map(formatPositionEvent), `⏱ ${formatKyivTime(at)}`].join("\n\n");
}

function logDetails(e: SourcedEvent): PositionLogDetails {
  const p = e.position;
  return {
    exchange: e.source.exchange,
    label: e.source.label,
    side: p.side,
    leverage: p.leverage,
    sizeUsd: p.notionalUsd,
    ...(e.kind === "closed" ? { pnlUsd: e.pnlUsd, approximate: true } : {}),
    ...(e.kind === "pnlSign" ? { pnlUsd: e.pnlUsd, positive: e.positive } : {}),
    ...(e.kind === "liquidation" ? { distancePercent: e.distancePercent } : {}),
  };
}

export type PositionDelivery = "sent" | "failed" | "site";

/**
 * Sends one user's events as one Telegram message (when Telegram is linked and on) and records
 * each event in the alert log either way: the log on the site is a channel of its own.
 */
export async function deliverPositionEvents(
  userId: string,
  events: SourcedEvent[],
  now = new Date(),
): Promise<PositionDelivery> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, isBlocked: true, telegramNotificationsEnabled: true },
  });
  if (!user || user.isBlocked) return "site";
  let status: PositionDelivery = "site";
  let failure: string | null = null;
  if (user.telegramChatId && user.telegramNotificationsEnabled && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      await sendTelegramHtml(user.telegramChatId, formatPositionMessage(events, now));
      status = "sent";
    } catch (error) {
      status = "failed";
      failure = error instanceof TelegramError ? error.message : "Ошибка отправки";
    }
  }
  await prisma.notificationLog.createMany({
    data: events.map((e) => ({
      userId,
      tokenSymbol: e.position.base,
      message: failure ?? formatPositionEvent(e).replace(/<[^>]+>/g, ""),
      deltaPercent: 0,
      price: Number(e.position.markPrice ?? 0) || 0,
      status,
      sentAt: now,
      kind: e.kind,
      details: logDetails(e) as Prisma.InputJsonValue,
    })),
  });
  return status;
}
