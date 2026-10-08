import { prisma } from "@/lib/db/prisma";

/** Idempotent upgrade for existing db-push installations. No rows are changed. */
export async function prepareWalletConnections() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1491009)`;
    await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeConnection_walletId_exchange_key" ON "ExchangeConnection"("walletId", "exchange")`;
    await tx.$executeRaw`DROP INDEX IF EXISTS "ExchangeConnection_walletId_key"`;
  });
}
