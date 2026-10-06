import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const owner = (
    await readFile("/tmp/cryptoportfolio-worker-id", "utf8")
  ).trim();
  const lease = await db.exchangeWorkerLease.findUnique({
    where: { name: `worker:${owner}` },
  });
  if (!lease || lease.expiresAt.getTime() <= Date.now()) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
