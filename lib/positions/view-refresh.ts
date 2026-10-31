import { prisma } from "@/lib/db/prisma";
import { editWithKeyboard } from "@/lib/services/telegram";
import { positionsComplete, type OpenPosition, type SyncResult } from "@/lib/exchanges/types";
import {
  formatPositionsMessage,
  positionsKeyboard,
  positionsSnapshot,
  type BotPosition,
} from "@/lib/telegram/positions-bot";
import { WATCHED_STATUSES, type Connection } from "./alert-service";
import type { PositionViewRequest } from "./view-requests";

/** Worker side: one fresh read of a connection's positions, null when it is not available. */
export type ReadPositions = (
  row: Connection,
) => Promise<{ result: SyncResult; at: number } | null>;

function toBotPosition(p: OpenPosition, connectionId: string, exchange: string): BotPosition {
  return {
    connectionId,
    exchange,
    base: p.base,
    side: p.side,
    leverage: p.leverage,
    notionalUsd: p.notionalUsd,
    entryPrice: p.entryPrice,
    markPrice: p.markPrice,
    liquidationPrice: p.liquidationPrice,
    margin: p.margin,
    unrealizedPnl: p.unrealizedPnl,
    unrealizedPnlUsd: p.unrealizedPnlUsd,
  };
}

/** The worker has no public URL of its own: the site is where it sends its activity polls. */
export function workerSiteUrl(env: NodeJS.ProcessEnv = process.env) {
  const site = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (site) return site;
  try {
    return env.EXCHANGE_ACTIVITY_URL ? new URL(env.EXCHANGE_ACTIVITY_URL).origin : null;
  } catch {
    return null;
  }
}

/**
 * Answers one bot request: fresh positions where the read succeeded, the stored ones elsewhere
 * (named in the message), then one edit of that message. Nothing is written to the database.
 */
export async function refreshPositionView(request: PositionViewRequest, read: ReadPositions) {
  const [snapshot, rows] = await Promise.all([
    positionsSnapshot(request.userId),
    prisma.exchangeConnection.findMany({
      where: { userId: request.userId, status: { in: WATCHED_STATUSES } },
      include: { wallet: true },
    }),
  ]);
  const fresh = new Map<string, { result: SyncResult; at: number }>();
  for (const row of rows) {
    const reading = await read(row);
    if (reading && positionsComplete(reading.result)) fresh.set(row.id, reading);
  }
  const positions = [
    ...snapshot.positions.filter((p) => !fresh.has(p.connectionId)),
    ...snapshot.connections.flatMap((c) =>
      (fresh.get(c.id)?.result.accounts ?? []).flatMap((a) =>
        (a.positions ?? []).map((p) => toBotPosition(p, c.id, c.exchange)),
      ),
    ),
  ];
  const stale = snapshot.connections.filter((c) => !fresh.has(c.id));
  const times = snapshot.connections.map((c) => fresh.get(c.id)?.at ?? c.positionsAt);
  await editWithKeyboard(
    request.chatId,
    request.messageId,
    formatPositionsMessage(
      { connections: snapshot.connections, positions },
      {
        failed: [...new Set(stale.map((c) => c.exchange))],
        dataAt: times.some((t) => t === null) ? null : Math.min(...(times as number[])),
      },
    ),
    positionsKeyboard(workerSiteUrl()),
  );
}
