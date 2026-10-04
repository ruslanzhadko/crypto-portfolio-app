import { PrismaClient } from '@prisma/client';

// Additive upgrade for installations managed with db push (no migration history).
// Does not rewrite existing chat recipients, credentials, roles or accounts.
const prisma = new PrismaClient();
async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT`;
    await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramBotAccess" BOOLEAN NOT NULL DEFAULT false`;
    await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true`;
    await tx.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0`;
    await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramUserId_key" ON "User"("telegramUserId")`;
    await tx.$executeRaw`CREATE TABLE IF NOT EXISTS "AuthRateLimit" ("key" TEXT NOT NULL PRIMARY KEY, "attempts" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL)`;
    await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt")`;
  });
  console.log(
    'Telegram auth schema upgraded; existing accounts and notification recipients preserved.',
  );
}
main()
  .catch(() => {
    console.error('Schema upgrade failed. Check database access.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
