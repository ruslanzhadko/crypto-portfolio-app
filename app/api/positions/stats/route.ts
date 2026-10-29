import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/api/auth-guard";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { exchangeJson, failure, safeApiFailure } from "@/lib/exchanges/api";
import { periodStart, tradeStats, type StatsTrade } from "@/lib/positions/trade-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rows read for one period; enough for months of active trading. */
const MAX_TRADES = 5_000;
/** Rows per page of the trades table. */
const PAGE_SIZE = 20;

const querySchema = z.object({
  period: z.enum(["today", "7d", "30d", "all"]).default("30d"),
  exchange: z.string().max(40).optional(),
  connectionId: z.string().max(100).optional(),
  coin: z.string().max(40).optional(),
  side: z.enum(["long", "short"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
});

const num = (value: { toString(): string } | null) => (value === null ? null : Number(value.toString()));

/**
 * Trading statistics of the closed trades in a period (docs/TRADING_STATS.md). Reads only the
 * stored trades: opening the page never wakes the exchange worker.
 */
export async function GET(req: Request) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    if (!exchangesEnabled(guard.user.id)) return failure("NOT_FOUND", 404);
    const params = Object.fromEntries(
      [...new URL(req.url).searchParams].filter(([, value]) => value !== ""),
    );
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) return failure("BAD_REQUEST");
    const { period, exchange, connectionId, coin, side, page } = parsed.data;
    const now = Date.now();
    const from = periodStart(period, now);

    const rows = await prisma.closedTrade.findMany({
      where: { userId: guard.user.id, ...(from !== null ? { closedAt: { gte: new Date(from) } } : {}) },
      orderBy: { closedAt: "desc" },
      take: MAX_TRADES,
      select: {
        id: true,
        connectionId: true,
        symbol: true,
        base: true,
        side: true,
        size: true,
        entryPrice: true,
        exitPrice: true,
        openedAt: true,
        closedAt: true,
        pnlUsd: true,
        exact: true,
        connection: { select: { exchange: true, label: true } },
      },
    });
    const all: StatsTrade[] = rows.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      exchange: r.connection.exchange,
      label: r.connection.label,
      symbol: r.symbol,
      base: r.base,
      side: r.side === "short" ? "short" : "long",
      size: num(r.size),
      entryPrice: num(r.entryPrice),
      exitPrice: num(r.exitPrice),
      openedAt: r.openedAt?.getTime() ?? null,
      closedAt: r.closedAt.getTime(),
      pnlUsd: Number(r.pnlUsd.toString()),
      exact: r.exact,
    }));
    const trades = all.filter(
      (t) =>
        (!exchange || t.exchange === exchange) &&
        (!connectionId || t.connectionId === connectionId) &&
        (!coin || t.base.toUpperCase() === coin.toUpperCase()) &&
        (!side || t.side === side),
    );
    // Filter choices come from the whole period, so picking one never hides the others.
    const options = {
      exchanges: [...new Set(all.map((t) => t.exchange))].sort(),
      accounts: [...new Map(all.map((t) => [t.connectionId, { id: t.connectionId, label: t.label, exchange: t.exchange }])).values()],
      coins: [...new Set(all.map((t) => t.base))].sort(),
    };
    return exchangeJson({
      period,
      from,
      ...tradeStats(trades, from, now),
      trades: trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      totalTrades: trades.length,
      truncated: rows.length >= MAX_TRADES,
      options,
    });
  } catch (error) {
    return safeApiFailure(error);
  }
}
