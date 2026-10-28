import { prisma } from "@/lib/db/prisma";
import { safeError, type ExchangeAdapter } from "./types";
import type { Transfer } from "./transfers";
import { noteDeposit, RECENT_DEPOSIT_MS } from "./deposit-watch";

/**
 * Keeps deposit/withdrawal history in the database. Read at most every 30 minutes per account
 * (during a sync the worker runs anyway): once a year back, then from a day before the last
 * successful read so late status changes are caught. An exchange that keeps less than a year is
 * read 90 days back instead, and `transfersFrom` records how far the history goes so the long read
 * is never repeated. Only new or changed rows are written; a failure is recorded on the connection
 * and never fails the balance sync.
 */
const INTERVAL_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
const HISTORY_MS = 365 * DAY_MS;
const FALLBACK_MS = 90 * DAY_MS;
const OVERLAP_MS = DAY_MS;
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
  connection: {
    id: string;
    transfersAt: Date | null;
    transfersFrom?: Date | null;
    userId?: string;
    walletId?: string | null;
  },
  adapter: ExchangeAdapter,
  now = Date.now(),
): Promise<"skipped" | "saved" | "failed"> {
  if (!adapter.transfers) return "skipped";
  if (now - (lastAttempt.get(connection.id) ?? 0) < INTERVAL_MS) return "skipped";
  lastAttempt.set(connection.id, now);
  // Accounts that were never read a year back (new ones, and those read 90 days before) do it once.
  const deep = !connection.transfersFrom || !connection.transfersAt;
  let from = deep ? now - HISTORY_MS : connection.transfersAt!.getTime() - OVERLAP_MS;
  try {
    let rows: Transfer[];
    try {
      rows = await adapter.transfers(from);
    } catch (error) {
      if (!deep) throw error;
      from = now - FALLBACK_MS;
      rows = await adapter.transfers(from);
    }
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
    // A deposit seen for the first time, or a withdrawal that just completed, made recently: the
    // wallet on the other side may still show the old balance.
    const fresh = rows.some((row) => {
      if (now - row.occurredAt.getTime() >= RECENT_DEPOSIT_MS) return false;
      const known = stored.get(`${row.direction}:${row.externalId}`);
      return row.direction === "deposit"
        ? row.status !== "failed" && !known
        : row.status === "completed" && known?.status !== "completed";
    });
    if (fresh && connection.userId && connection.transfersAt)
      noteDeposit(connection.userId, connection.walletId ?? null, 0, now);
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
        data: {
          transfersAt: new Date(now),
          transfersError: null,
          ...(deep ? { transfersFrom: new Date(from) } : {}),
        },
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
