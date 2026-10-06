import { prisma } from "../lib/db/prisma";
import {
  discoverHyperliquid,
  evictClients,
  newWorkerId,
  runOneJob,
  workerHeartbeat,
} from "../lib/exchanges/worker";
import { sleep } from "../lib/exchanges/transport";

async function main() {
  if (process.env.EXCHANGES_ENABLED !== "true")
    throw new Error("EXCHANGES_ENABLED must be true");
  const owner = newWorkerId();
  let stopping = false,
    lastDiscovery = 0;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  const heartbeat = setInterval(() => {
    void workerHeartbeat(owner).catch(() => {});
  }, 20_000);
  try {
    await workerHeartbeat(owner);
    while (!stopping) {
      try {
        if (Date.now() - lastDiscovery > 60_000) {
          await discoverHyperliquid();
          await evictClients();
          lastDiscovery = Date.now();
          await prisma.exchangeSyncRun.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
          });
          await prisma.exchangeWorkerLease.deleteMany({
            where: {
              name: { startsWith: "worker:" },
              expiresAt: { lt: new Date(Date.now() - 86400_000) },
            },
          });
        }
        if (!(await runOneJob())) await sleep(2000);
      } catch {
        console.error(
          "[exchange-worker] Cycle failed; retrying. Provider details redacted.",
        );
        await sleep(5000);
      }
    }
  } finally {
    clearInterval(heartbeat);
    await prisma.exchangeWorkerLease.deleteMany({
      where: { name: `worker:${owner}` },
    });
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "[exchange-worker] Startup failed. Check configuration and database migration.",
  );
  process.exitCode = 1;
});
