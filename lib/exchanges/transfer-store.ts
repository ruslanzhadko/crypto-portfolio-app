import { prisma } from "@/lib/db/prisma";
import { safeError, type ExchangeAdapter } from "./types";
import type { Transfer } from "./transfers";
import { noteDeposit, RECENT_DEPOSIT_MS } from "./deposit-watch";

/**
 * Keeps deposit/withdrawal history in the database. Read at most every 30 minutes per account
 * (during a sync the worker runs anyway), the first time for the last 90 days, then from a day
 * before the last successful read so late status changes are caught. Only new or changed rows are
 * written; a failure is recorded on the connection and never fails the balance sync.
 */
const INTERVAL_MS = 30 * 60_000;
const BACKFILL_MS = 90 * 86_400_000;
const OVERLAP_MS = 86_400_000;
const lastAttempt = new Map<string, number>();

function changed(
  stored: { status: string; txHash: string | null; fee: { toFixed(): string } | null },
  next: Transfer,
) {
  return (
    stored.status !== next.status ||
    stored.txHash !== next.txHash ||
    (stored.fee?.toFixed() ?? null) !== (next.fee === null ? null : next.fee)
  );
}

export async function syncTransfers(
  connection: { id: string; transfersAt: Date | null; userId?: string; walletId?: string | null },
  adapter: ExchangeAdapter,
  now = Date.now(),
): Promise<"skipped" | "saved" | "failed"> {
  if (!adapter.transfers) return "skipped";
  if (now - (lastAttempt.get(connection.id) ?? 0) < INTERVAL_MS) return "skipped";
  lastAttempt.set(connection.id, now);
  const since = connection.transfersAt
    ? connection.transfersAt.getTime() - OVERLAP_MS
    : now - BACKFILL_MS;
  try {
    const rows = await adapter.transfers(since);
    const stored = new Map(
      (
        await prisma.exchangeTransfer.findMany({
          where: {
            connectionId: connection.id,
            externalId: { in: [...new Set(rows.map((row) => row.externalId))] },
          },
          select: { direction: true, externalId: true, status: true, txHash: true, fee: true },
        })
      ).map((row) => [`${row.direction}:${row.externalId}`, row]),
    );
    // A deposit seen for the first time, made recently: its wallet may still show the money.
    const fresh = rows.some(
      (row) =>
        row.direction === "deposit" &&
        row.status !== "failed" &&
        !stored.has(`${row.direction}:${row.externalId}`) &&
        now - row.occurredAt.getTime() < RECENT_DEPOSIT_MS,
    );
    if (fresh && connection.userId && connection.transfersAt)
      noteDeposit(connection.userId, connection.walletId ?? null);
    const writes = rows
      .filter((row) => {
        const known = stored.get(`${row.direction}:${row.externalId}`);
        return !known || changed(known, row);
      })
      .map((row) =>
        prisma.exchangeTransfer.upsert({
          where: {
            connectionId_direction_externalId: {
              connectionId: connection.id,
              direction: row.direction,
              externalId: row.externalId,
            },
          },
          create: { connectionId: connection.id, ...row },
          update: { status: row.status, txHash: row.txHash, fee: row.fee, amount: row.amount },
        }),
      );
    await prisma.$transaction([
      ...writes,
      prisma.exchangeConnection.update({
        where: { id: connection.id },
        data: { transfersAt: new Date(now), transfersError: null },
      }),
    ]);
    return "saved";
  } catch (error) {
    await prisma.exchangeConnection
      .update({ where: { id: connection.id }, data: { transfersError: safeError(error) } })
      .catch(() => {});
    return "failed";
  }
}
