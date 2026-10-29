import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { periodStart, tradeStats, type StatsPeriod, type StatsTrade } from "@/lib/positions/trade-stats";
import type { InlineKeyboard } from "@/lib/services/telegram";

/**
 * Trading statistics in the Telegram bot: /stats (and /today, /week, /month, /all) answer with the
 * same figures as the Statistics tab; buttons under the message switch the period in place.
 */
export const PERIOD_COMMANDS: Record<string, StatsPeriod> = {
  "/stats": "today",
  "/today": "today",
  "/week": "7d",
  "/month": "30d",
  "/all": "all",
};

const PERIOD_TITLES: Record<StatsPeriod, string> = {
  today: "сегодня",
  "7d": "7 дней",
  "30d": "30 дней",
  all: "всё время",
};
const BUTTONS: [StatsPeriod, string][] = [
  ["today", "Сегодня"],
  ["7d", "7 дней"],
  ["30d", "30 дней"],
  ["all", "Всё"],
];
const EXCHANGE_NAMES: Record<string, string> = {
  binance: "Binance", bybit: "Bybit", gate: "Gate", okx: "OKX", bingx: "BingX", bitget: "Bitget",
  kucoin: "KuCoin", hyperliquid: "Hyperliquid", aster: "Aster",
};

/** "/stats", "/stats@SomeBot" → "/stats". */
export function commandOf(text: string): string {
  return (text.trim().split(/\s+/)[0] ?? "").replace(/@\w+$/, "").toLowerCase();
}

export function parseStatsCallback(data: string | undefined): StatsPeriod | null {
  const period = data?.startsWith("stats:") ? data.slice(6) : null;
  return period && BUTTONS.some(([p]) => p === period) ? (period as StatsPeriod) : null;
}

const money = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))} $`;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const exchange = (id: string) => EXCHANGE_NAMES[id] ?? escape(id);

export function formatStatsMessage(period: StatsPeriod, trades: StatsTrade[], now = Date.now()): string {
  const title = `📊 <b>Статистика торговли · ${PERIOD_TITLES[period]}</b>`;
  if (!trades.length) return `${title}\n\nЗакрытых сделок за этот период нет.`;
  const stats = tradeStats(trades, periodStart(period, now), now);
  const s = stats.summary;
  const describe = (t: StatsTrade) =>
    `${escape(t.base)} ${t.side === "short" ? "шорт" : "лонг"} ${money(t.pnlUsd)} (${exchange(t.exchange)})`;
  const lines = [
    title,
    "",
    `${s.totalUsd >= 0 ? "🟢" : "🔴"} Итог: <b>${money(s.totalUsd)}</b>`,
    `Сделок: ${s.count} — ${s.wins} ✅ / ${s.losses} ❌${s.winRate == null ? "" : ` (${Math.round(s.winRate * 100)}%)`}`,
  ];
  if (s.avgWinUsd != null || s.avgLossUsd != null)
    lines.push(
      [
        s.avgWinUsd != null ? `средняя прибыль ${money(s.avgWinUsd)}` : null,
        s.avgLossUsd != null ? `средний убыток ${money(s.avgLossUsd)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .replace(/^./, (c) => c.toUpperCase()),
    );
  if (s.best) lines.push(`Лучшая: ${describe(s.best)}`);
  if (s.worst) lines.push(`Худшая: ${describe(s.worst)}`);
  if (stats.byExchange.length > 1)
    lines.push(
      `По биржам: ${stats.byExchange
        .slice(0, 5)
        .map((g) => `${exchange(g.key)} ${money(g.pnlUsd)}`)
        .join(" · ")}`,
    );
  if (stats.byCoin.length > 1)
    lines.push(
      `Монеты: ${stats.byCoin
        .slice(0, 5)
        .map((g) => `${escape(g.key)} ${money(g.pnlUsd)}`)
        .join(" · ")}`,
    );
  if (s.approximate) lines.push(`≈ у ${s.approximate} из ${s.count} — оценка по последнему опросу`);
  return lines.join("\n");
}

export function statsKeyboard(active: StatsPeriod, siteUrl: string | null): InlineKeyboard {
  const rows: InlineKeyboard = [
    BUTTONS.map(([period, label]) => ({
      text: period === active ? `• ${label} •` : label,
      callback_data: `stats:${period}`,
    })),
  ];
  if (siteUrl) rows.push([{ text: "Открыть на сайте", url: `${siteUrl}/ru/positions?tab=stats` }]);
  return rows;
}

export const NOT_LINKED =
  "Этот Telegram не привязан к аккаунту CryptoPortfolio. Войдите на сайте и подключите Telegram в настройках.";

/** The user this chat belongs to, when the chat is linked and exchanges are on for them. */
export async function chatUser(chatId: number) {
  const user = await prisma.user.findFirst({
    where: { telegramChatId: String(chatId), isBlocked: false },
    select: { id: true },
  });
  return user && exchangesEnabled(user.id) ? user : null;
}

/** The statistics message of one user for a period. */
export async function statsMessage(userId: string, period: StatsPeriod, now = Date.now()) {
  const from = periodStart(period, now);
  const rows = await prisma.closedTrade.findMany({
    where: { userId, ...(from !== null ? { closedAt: { gte: new Date(from) } } : {}) },
    orderBy: { closedAt: "desc" },
    take: 5_000,
    select: {
      id: true,
      connectionId: true,
      symbol: true,
      base: true,
      side: true,
      openedAt: true,
      closedAt: true,
      pnlUsd: true,
      exact: true,
      connection: { select: { exchange: true, label: true } },
    },
  });
  const trades: StatsTrade[] = rows.map((r) => ({
    id: r.id,
    connectionId: r.connectionId,
    exchange: r.connection.exchange,
    label: r.connection.label,
    symbol: r.symbol,
    base: r.base,
    side: r.side === "short" ? "short" : "long",
    size: null,
    entryPrice: null,
    exitPrice: null,
    openedAt: r.openedAt?.getTime() ?? null,
    closedAt: r.closedAt.getTime(),
    pnlUsd: Number(r.pnlUsd.toString()),
    exact: r.exact,
  }));
  return formatStatsMessage(period, trades, now);
}
