import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { sendTelegramHtml, TelegramError } from "@/lib/services/telegram";
import { readPositionAlertSettings } from "./alert-settings";
import { kyivDay, kyivDayStart } from "./trade-stats";

/**
 * Daily summary in Telegram (docs/TRADING_STATS.md §3): right after midnight in Kyiv, the closed
 * trades of the day before. No trades, no message. One log entry per user and day keeps a restart
 * from sending it twice.
 */
const EXCHANGE_NAMES: Record<string, string> = {
  binance: "Binance", bybit: "Bybit", gate: "Gate", okx: "OKX", bingx: "BingX", bitget: "Bitget",
  kucoin: "KuCoin", hyperliquid: "Hyperliquid", aster: "Aster",
};

export interface SummaryTrade {
  base: string;
  side: string;
  exchange: string;
  pnlUsd: number;
  exact: boolean;
}

const money = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))} $`;

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "2026-10-29" → "29.10". */
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

export function formatDailySummary(day: string, trades: SummaryTrade[], statsUrl: string | null): string {
  const total = trades.reduce((sum, t) => sum + t.pnlUsd, 0);
  const wins = trades.filter((t) => t.pnlUsd > 0).length;
  const losses = trades.filter((t) => t.pnlUsd < 0).length;
  const sorted = [...trades].sort((a, b) => b.pnlUsd - a.pnlUsd);
  const describe = (t: SummaryTrade) =>
    `${escape(t.base)} ${t.side === "short" ? "шорт" : "лонг"} ${money(t.pnlUsd)} (${EXCHANGE_NAMES[t.exchange] ?? escape(t.exchange)})`;
  const lines = [
    `${total >= 0 ? "🟢" : "🔴"} <b>Итог за ${shortDay(day)}: ${money(total)}</b>`,
    `Сделок: ${trades.length} — ${wins} ✅ / ${losses} ❌`,
  ];
  if (sorted[0] && sorted[0].pnlUsd > 0) lines.push(`Лучшая: ${describe(sorted[0])}`);
  const worst = sorted.at(-1);
  if (worst && worst.pnlUsd < 0) lines.push(`Худшая: ${describe(worst)}`);
  const exchanges = new Map<string, number>();
  for (const t of trades) exchanges.set(t.exchange, (exchanges.get(t.exchange) ?? 0) + t.pnlUsd);
  if (exchanges.size > 1)
    lines.push(
      `По биржам: ${[...exchanges]
        .sort((a, b) => b[1] - a[1])
        .map(([e, v]) => `${EXCHANGE_NAMES[e] ?? escape(e)} ${money(v)}`)
        .join(" · ")}`,
    );
  const approximate = trades.filter((t) => !t.exact).length;
  if (approximate) lines.push(`≈ у ${approximate} из ${trades.length} — оценка по последнему опросу`);
  if (statsUrl) lines.push(`<a href="${statsUrl}">Статистика торговли</a>`);
  return lines.join("\n");
}

/** Site link for the message: the worker knows the site through its activity signal URL. */
function statsUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const origin = new URL(env.EXCHANGE_ACTIVITY_URL ?? "").origin;
    return `${origin}/ru/positions?tab=stats`;
  } catch {
    return null;
  }
}

/** Sends yesterday's summary to every user who turned it on; returns how many were sent or logged. */
export async function sendDailySummaries(now = Date.now()): Promise<number> {
  const today = kyivDay(now);
  const to = kyivDayStart(today);
  const day = kyivDay(to - 1);
  const from = kyivDayStart(day);
  const users = (
    await prisma.user.findMany({
      where: { isBlocked: false, positionAlerts: { not: Prisma.DbNull } },
      select: { id: true, positionAlerts: true, telegramChatId: true, telegramNotificationsEnabled: true },
    })
  ).filter((u) => readPositionAlertSettings(u.positionAlerts).dailySummary && exchangesEnabled(u.id));
  let done = 0;
  for (const user of users) {
    const sent = await prisma.notificationLog.findFirst({
      where: { userId: user.id, kind: "daily", details: { path: ["day"], equals: day } },
      select: { id: true },
    });
    if (sent) continue;
    const rows = await prisma.closedTrade.findMany({
      where: { userId: user.id, closedAt: { gte: new Date(from), lt: new Date(to) } },
      select: { base: true, side: true, pnlUsd: true, exact: true, connection: { select: { exchange: true } } },
    });
    if (!rows.length) continue;
    const trades: SummaryTrade[] = rows.map((r) => ({
      base: r.base,
      side: r.side,
      exchange: r.connection.exchange,
      pnlUsd: Number(r.pnlUsd.toString()),
      exact: r.exact,
    }));
    const text = formatDailySummary(day, trades, statsUrl());
    let status: "sent" | "failed" | "site" = "site";
    let failure: string | null = null;
    if (user.telegramChatId && user.telegramNotificationsEnabled && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        await sendTelegramHtml(user.telegramChatId, text);
        status = "sent";
      } catch (error) {
        status = "failed";
        failure = error instanceof TelegramError ? error.message : "Ошибка отправки";
      }
    }
    const totalUsd = trades.reduce((sum, t) => sum + t.pnlUsd, 0);
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        tokenSymbol: shortDay(day),
        message: failure ?? text.replace(/<[^>]+>/g, ""),
        deltaPercent: 0,
        price: 0,
        status,
        sentAt: new Date(now),
        kind: "daily",
        details: {
          day,
          pnlUsd: totalUsd,
          count: trades.length,
          wins: trades.filter((t) => t.pnlUsd > 0).length,
          losses: trades.filter((t) => t.pnlUsd < 0).length,
          approximate: trades.some((t) => !t.exact),
        },
      },
    });
    console.log(`[daily-summary] ${day} ${status}`);
    done++;
  }
  return done;
}

/** Runs once per Kyiv day, a minute after midnight, inside the worker loop. */
export class DailySummary {
  private lastDay: string | null = null;
  async maybeRun(now = Date.now()): Promise<boolean> {
    const today = kyivDay(now);
    if (today === this.lastDay || now < kyivDayStart(today) + 60_000) return false;
    this.lastDay = today;
    try {
      await sendDailySummaries(now);
    } catch {
      console.error("[daily-summary] failed; retrying tomorrow");
    }
    return true;
  }
}
