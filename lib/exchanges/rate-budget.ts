import { prisma } from "@/lib/db/prisma";

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Shared by the web app and worker so wallet discovery uses the same IP budget. */
export async function reserveRequest(exchange: string, weight = 1) {
  const ms = Math.ceil(weight * (exchange === "binance" ? 50 : 200));
  const rows = await prisma.$queryRaw<{ start: Date }[]>`
    INSERT INTO "ExchangeWorkerLease" ("name", "owner", "expiresAt", "heartbeatAt")
    VALUES (${`rate:${exchange}`}, 'rate', clock_timestamp() + ${ms} * interval '1 millisecond', clock_timestamp())
    ON CONFLICT ("name") DO UPDATE SET "expiresAt" = GREATEST("ExchangeWorkerLease"."expiresAt", clock_timestamp()) + ${ms} * interval '1 millisecond'
    RETURNING "expiresAt" - ${ms} * interval '1 millisecond' AS start`;
  await sleep(Math.max(0, rows[0]!.start.getTime() - Date.now()));
}
