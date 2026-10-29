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

/** Rows shown inside a collapsed list; Telegram messages stop at 4096 characters. */
const LIST_LIMIT = 25;

const plural = (n: number) => {
  const mod10 = n % 10,
    mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11
    ? "сделка"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "сделки"
      : "сделок";
};

const kyivTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
const kyivDate = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit" });

/** A list that Telegram shows collapsed to a few lines; a tap opens all of it. */
function collapsible(lines: string[], more: number): string {
  const tail = more > 0 ? `\n…и ещё ${more}` : "";
  return `<blockquote expandable>${lines.join("\n")}${tail}</blockquote>`;
}

export function formatStatsMessage(period: StatsPeriod, trades: StatsTrade[], now = Date.now()): string {
  const title = `📊 <b>Статистика торговли · ${PERIOD_TITLES[period]}</b>`;
  if (!trades.length) return `${title}\n\nЗакрытых сделок за этот период нет.`;
  const stats = tradeStats(trades, periodStart(period, now), now);
  const s = stats.summary;
  const side = (t: StatsTrade) => (t.side === "short" ? "шорт" : "лонг");
  const sections: string[] = [title];

  sections.push(
    [
      `${s.totalUsd >= 0 ? "🟢" : "🔴"} Итог: <b>${money(s.totalUsd)}</b>`,
      `🔢 ${s.count} ${plural(s.count)}: ✅ ${s.wins} · ❌ ${s.losses}${s.winRate == null ? "" : ` · ${Math.round(s.winRate * 100)}% в плюсе`}`,
      ...(s.avgWinUsd != null ? [`📈 Средняя прибыль: ${money(s.avgWinUsd)}`] : []),
      ...(s.avgLossUsd != null ? [`📉 Средний убыток: ${money(s.avgLossUsd)}`] : []),
    ].join("\n"),
  );

  const extremes = [
    ...(s.best ? [`🏆 Лучшая: <b>${escape(s.best.base)}</b> ${side(s.best)} ${money(s.best.pnlUsd)} · ${exchange(s.best.exchange)}`] : []),
    ...(s.worst ? [`💔 Худшая: <b>${escape(s.worst.base)}</b> ${side(s.worst)} ${money(s.worst.pnlUsd)} · ${exchange(s.worst.exchange)}`] : []),
  ];
  if (extremes.length) sections.push(extremes.join("\n"));

  if (stats.byExchange.length > 1)
    sections.push(
      [
        "<b>По биржам</b>",
        ...stats.byExchange.map((g) => `• ${exchange(g.key)}: ${money(g.pnlUsd)} · ${g.count} ${plural(g.count)}`),
      ].join("\n"),
    );

  const coins = [...stats.byCoin].sort((a, b) => b.pnlUsd - a.pnlUsd);
  sections.push(
    `<b>По монетам</b> (${coins.length})\n` +
      collapsible(
        coins
          .slice(0, LIST_LIMIT)
          .map((g) => `${g.pnlUsd >= 0 ? "🟢" : "🔴"} ${escape(g.key)}: ${money(g.pnlUsd)} · ${g.count} ${plural(g.count)}`),
        coins.length - LIST_LIMIT,
      ),
  );

  // Newest first; within one day the time is enough, otherwise the date too.
  const oneDay = period === "today";
  const latest = [...trades].sort((a, b) => b.closedAt - a.closedAt);
  sections.push(
    `<b>Сделки</b> (${latest.length})\n` +
      collapsible(
        latest.slice(0, LIST_LIMIT).map((t) => {
          const when = oneDay
            ? kyivTime.format(t.closedAt)
            : `${kyivDate.format(t.closedAt)} ${kyivTime.format(t.closedAt)}`;
          return `${t.pnlUsd >= 0 ? "🟢" : "🔴"} ${when} ${escape(t.base)} ${side(t)} ${t.exact ? "" : "≈"}${money(t.pnlUsd)} · ${exchange(t.exchange)}`;
        }),
        latest.length - LIST_LIMIT,
      ),
  );

  if (s.approximate) sections.push(`≈ у ${s.approximate} из ${s.count} — оценка по последнему опросу`);
  return sections.join("\n\n");
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
    where: { userId, excluded: false, ...(from !== null ? { closedAt: { gte: new Date(from) } } : {}) },
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
