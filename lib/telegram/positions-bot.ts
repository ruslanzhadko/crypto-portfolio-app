import { prisma } from "@/lib/db/prisma";
import type { InlineKeyboard } from "@/lib/services/telegram";
import { escapeHtml, exchangeName, money } from "./stats-bot";

/**
 * Open positions in the Telegram bot: /positions answers with a snapshot, a button refreshes it.
 * The message never updates by itself: the Bot API cannot tell whether anyone is looking
 * (TELEGRAM_POSITIONS.md §1).
 */
export const POSITIONS_COMMAND = "/positions";
export const REFRESH_CALLBACK = "pos:refresh";

/** Stored positions older than this are refreshed through the worker. */
export const SNAPSHOT_FRESH_MS = 60_000;
/** Rows in one message; Telegram messages stop at 4096 characters. */
const POSITIONS_LIMIT = 20;

type Value = { toString(): string } | null;
const text = (value: Value) => (value === null ? null : value.toString());

export type BotPosition = {
  connectionId: string;
  exchange: string;
  base: string;
  side: string;
  leverage: string | null;
  notionalUsd: string | null;
  entryPrice: string | null;
  markPrice: string | null;
  liquidationPrice: string | null;
  margin: string | null;
  unrealizedPnl: string | null;
  unrealizedPnlUsd: string | null;
};
export type BotConnection = { id: string; exchange: string; positionsAt: number | null };
export type PositionsSnapshot = { connections: BotConnection[]; positions: BotPosition[] };

const number = (value: string | null) => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const price = (value: string | null) => {
  const n = number(value);
  return n === null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 6 }).format(n);
};
const size = (value: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.abs(value))} $`;
const percent = (value: number, digits = 1) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const kyivClock = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Kyiv",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function age(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 60 ? `${minutes} мин назад` : `${Math.floor(minutes / 60)} ч назад`;
}

function formatPosition(p: BotPosition) {
  const usd = number(p.unrealizedPnlUsd),
    native = number(p.unrealizedPnl),
    margin = number(p.margin),
    notional = number(p.notionalUsd),
    mark = number(p.markPrice),
    liquidation = number(p.liquidationPrice),
    leverage = number(p.leverage);
  const icon = usd === null ? "⚪" : usd >= 0 ? "🟢" : "🔴";
  const side = p.side === "short" ? "шорт" : "лонг";
  const returnOnMargin =
    native !== null && margin !== null && margin > 0
      ? ` (${native >= 0 ? "+" : "−"}${percent((Math.abs(native) / margin) * 100)}%)`
      : "";
  const details = [
    `вход ${price(p.entryPrice)}`,
    `цена ${price(p.markPrice)}`,
    ...(mark && liquidation ? [`до ликв. ${percent((Math.abs(mark - liquidation) / mark) * 100)}%`] : []),
  ];
  return [
    `${icon} <b>${escapeHtml(p.base)}</b> ${side}${leverage ? ` ${leverage}x` : ""} · ${exchangeName(p.exchange)}`,
    `${usd === null ? "PnL неизвестен" : money(usd)}${returnOnMargin}${notional === null ? "" : ` · размер ${size(notional)}`}`,
    details.join(" · "),
  ].join("\n");
}

export function formatPositionsMessage(
  snapshot: PositionsSnapshot,
  options: { refreshing?: boolean; failed?: string[]; dataAt?: number | null } = {},
  now = Date.now(),
) {
  const { connections, positions } = snapshot;
  if (!connections.length) return "📈 <b>Позиции</b>\n\nБиржи не подключены. Добавьте их на сайте.";
  const known = connections.map((c) => c.positionsAt);
  const dataAt =
    options.dataAt !== undefined
      ? options.dataAt
      : known.some((at) => at === null)
        ? null
        : Math.min(...(known as number[]));
  const pnl = positions.map((p) => number(p.unrealizedPnlUsd)).filter((n): n is number => n !== null);
  const total = pnl.reduce((sum, n) => sum + n, 0);
  const title = positions.length
    ? `📈 <b>Позиции · ${positions.length}</b>${pnl.length ? ` · uPnL <b>${money(total)}</b>` : ""}`
    : "📈 <b>Позиции</b>";
  const time =
    dataAt === null
      ? "Время данных неизвестно"
      : `Данные на ${kyivClock.format(dataAt)}${now - dataAt >= SNAPSHOT_FRESH_MS ? ` (${age(now - dataAt)})` : ""}`;
  const header = [
    title,
    time,
    ...(options.refreshing ? ["🔄 Запросил свежие данные"] : []),
    ...(options.failed?.length ? [`⚠️ Не обновились: ${options.failed.map(exchangeName).join(", ")}`] : []),
  ].join("\n");
  if (!positions.length) return `${header}\n\nОткрытых позиций нет.`;
  const sorted = [...positions].sort(
    (a, b) => Math.abs(number(b.notionalUsd) ?? 0) - Math.abs(number(a.notionalUsd) ?? 0),
  );
  const more = sorted.length - POSITIONS_LIMIT;
  return [
    header,
    ...sorted.slice(0, POSITIONS_LIMIT).map(formatPosition),
    ...(more > 0 ? [`…и ещё ${more} на сайте`] : []),
  ].join("\n\n");
}

export function positionsKeyboard(siteUrl: string | null): InlineKeyboard {
  return [
    [
      { text: "🔄 Обновить", callback_data: REFRESH_CALLBACK },
      ...(siteUrl ? [{ text: "Открыть на сайте", url: `${siteUrl}/ru/positions` }] : []),
    ],
  ];
}

/** Some connection was not read recently (or never): the worker can do better than the database. */
export function snapshotStale(snapshot: PositionsSnapshot, now = Date.now()) {
  return snapshot.connections.some(
    (c) => c.positionsAt === null || now - c.positionsAt >= SNAPSHOT_FRESH_MS,
  );
}

export async function positionsSnapshot(userId: string): Promise<PositionsSnapshot> {
  const [connections, positions] = await Promise.all([
    prisma.exchangeConnection.findMany({
      where: { userId, status: { not: "DISCONNECTED" } },
      select: { id: true, exchange: true, positionsAt: true },
    }),
    prisma.exchangePosition.findMany({
      where: { account: { connection: { userId, status: { not: "DISCONNECTED" } } } },
      include: {
        account: { select: { connection: { select: { id: true, exchange: true } } } },
      },
    }),
  ]);
  return {
    connections: connections.map((c) => ({
      id: c.id,
      exchange: c.exchange,
      positionsAt: c.positionsAt?.getTime() ?? null,
    })),
    positions: positions.map((p) => ({
      connectionId: p.account.connection.id,
      exchange: p.account.connection.exchange,
      base: p.base,
      side: p.side,
      leverage: text(p.leverage),
      notionalUsd: text(p.notionalUsd),
      entryPrice: text(p.entryPrice),
      markPrice: text(p.markPrice),
      liquidationPrice: text(p.liquidationPrice),
      margin: text(p.margin),
      unrealizedPnl: text(p.unrealizedPnl),
      unrealizedPnlUsd: text(p.unrealizedPnlUsd),
    })),
  };
}

/** A worker holds a live lease; in idle mode the lease lasts until after the next slot. */
export async function workerOnline() {
  const lease = await prisma.exchangeWorkerLease.findFirst({
    where: { name: { startsWith: "worker:" }, expiresAt: { gt: new Date() } },
    select: { name: true },
  });
  return !!lease;
}
