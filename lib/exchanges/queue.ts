import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { LEASE_MS } from "./config";

export async function enqueue(
  connectionId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  // Do not touch a running job: its fenced writer owns this slot until completion.
  await tx.exchangeSyncJob.upsert({
    where: { connectionId },
    create: { connectionId },
    update: { dueAt: new Date(), forceBalances: true },
  });
}
export async function claimJob() {
  const token = randomUUID();
  const rows = await prisma.$queryRaw<
    { connectionId: string; forceBalances: boolean; attempts: number }[]
  >`
    UPDATE "ExchangeSyncJob" j SET "leaseToken" = ${token}, "leaseUntil" = clock_timestamp() + ${LEASE_MS} * interval '1 millisecond'
    WHERE j."connectionId" = (
      SELECT q."connectionId" FROM "ExchangeSyncJob" q
      JOIN "ExchangeConnection" c ON c.id = q."connectionId"
      JOIN "User" u ON u.id = c."userId"
      WHERE q."dueAt" <= clock_timestamp() AND (q."leaseUntil" IS NULL OR q."leaseUntil" < clock_timestamp())
        AND c.status IN ('PENDING', 'ACTIVE', 'PARTIAL', 'ERROR') AND NOT u."isBlocked"
      ORDER BY q."dueAt" FOR UPDATE OF q SKIP LOCKED LIMIT 1
    ) RETURNING j."connectionId", j."forceBalances", j.attempts`;
  return rows.length ? { ...rows[0]!, token } : null;
}
export function retryDelay(
  attempt: number,
  rateLimit = false,
  random = Math.random,
): number {
  return (
    Math.min(
      900_000,
      (rateLimit ? 60_000 : 5_000) * 2 ** Math.min(attempt, 7),
    ) + Math.floor(random() * 5000)
  );
}
