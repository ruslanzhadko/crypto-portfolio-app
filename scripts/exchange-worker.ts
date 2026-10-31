import { DailySummary } from "../lib/positions/daily-summary";
import { prisma } from "../lib/db/prisma";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  discoverHyperliquid,
  earliestDueAt,
  evictClients,
  flushCapitalSnapshots,
  newWorkerId,
  pullForward,
  runOneJob,
  setPositionObserver,
  workerHeartbeat,
} from "../lib/exchanges/worker";
import { PositionAlertService } from "../lib/positions/alert-service";
import { refreshPositionView } from "../lib/positions/view-refresh";
import { createAlertSignalClient } from "../lib/alerts/signal-client";
import { sleep } from "../lib/exchanges/transport";
import { prepareWalletConnections } from "../lib/exchanges/wallet-schema";
import { createActivityClient } from "../lib/exchanges/activity-client";
import {
  createWalletSyncClient,
  takeDueDeposits,
} from "../lib/exchanges/deposit-watch";
import { ACTIVITY_POLL_MS, nextIdleSlot } from "../lib/exchanges/config";

const ACTIVE_HEARTBEAT_MS = 20_000;
// Private to the worker (owned by its user in the image), not the shared temp directory.
const RUN_DIR = join(process.cwd(), ".worker-run");
const ALIVE_FILE = join(RUN_DIR, "alive");
const ID_FILE = join(RUN_DIR, "id");
const MAINTENANCE_MS = 60_000;
/** Neon scales to zero after 5 idle minutes; never wake it more often than this. */
const MIN_IDLE_WAKE_MS = 5 * 60_000;
/** Keeps the worker "online" in the UI until a little after the next slot. */
const IDLE_LEASE_MARGIN_MS = 10 * 60_000;

async function maintenance() {
  await discoverHyperliquid();
  await evictClients();
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

async function main() {
  if (process.env.EXCHANGES_ENABLED !== "true")
    throw new Error("EXCHANGES_ENABLED must be true");
  await prepareWalletConnections();
  const owner = newWorkerId();
  const activity = createActivityClient();
  const walletSync = createWalletSyncClient();
  // A likely deposit or withdrawal: have the web app sync wallets now, not in up to 4 hours.
  const requestWalletSyncs = async () => {
    if (!walletSync) return;
    for (const d of takeDueDeposits()) {
      const ok = await walletSync.request(d.userId, d.walletId);
      console.log(
        `[exchange-worker] transfer suspected; wallet sync ${ok ? "requested" : "request failed"}`,
      );
    }
  };
  const isActive = (userId: string) => !activity || activity.isActive(userId);
  // Position alerts: background polling for users who turned them on (POSITION_ALERTS.md).
  const alerts = new PositionAlertService();
  const daily = new DailySummary();
  const alertSignal = createAlertSignalClient();
  setPositionObserver((c, result, at) => alerts.observe(c, result, at));
  if (!process.env.TELEGRAM_BOT_TOKEN)
    console.warn(
      "[position-alerts] TELEGRAM_BOT_TOKEN not set: position alerts go to the site log only",
    );
  const runAlerts = async (fast: boolean) => {
    try {
      const reloaded = await alerts.maybeReload(
        activity?.positionAlertsVersion() ?? null,
      );
      if (alerts.size) await alerts.pollDue();
      await alerts.resolveClosed();
      await alerts.importClosed();
      const corrected = (await alerts.recheckClosed()) || (await alerts.reconcileEstimates());
      const users = await alerts.flush();
      for (const userId of users) await alertSignal?.fired(userId, Date.now());
      // Yesterday's trading summary, once right after midnight in Kyiv.
      const summarized = await daily.maybeRun();
      // In idle mode nothing else keeps the database awake: close the pool after touching it.
      if (!fast && (reloaded || corrected || users.length || summarized)) await prisma.$disconnect();
    } catch {
      console.error("[position-alerts] cycle failed; retrying next round");
    }
  };
  // The bot asked for fresh positions: one read and one message edit per request.
  const runPositionViews = async (fast: boolean) => {
    const requests = activity?.takePositionViews() ?? [];
    if (!requests.length) return;
    for (const request of requests)
      await refreshPositionView(request, (row) => alerts.readForView(row)).catch(() =>
        console.error("[position-views] refresh failed"),
      );
    if (!fast) await prisma.$disconnect();
  };
  console.log(
    activity
      ? "[exchange-worker] Viewer-driven mode: fast sync for viewers, otherwise every idle slot."
      : "[exchange-worker] Activity signal not configured: fast sync for everyone.",
  );
  let stopping = false,
    fast = !activity,
    lastMaintenance = 0,
    viewers = new Set<string>(),
    idleWakeAt = 0;
  // Database heartbeat only while fast; an idle slot writes a long lease itself.
  const heartbeat = setInterval(() => {
    if (fast) void workerHeartbeat(owner).catch(() => {});
  }, ACTIVE_HEARTBEAT_MS);
  const writeAlive = () =>
    writeFile(ALIVE_FILE, JSON.stringify({ at: Date.now() }), {
      mode: 0o600,
    }).catch(() => {});
  let alive: ReturnType<typeof setInterval> | undefined;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  try {
    await workerHeartbeat(owner);
    await mkdir(RUN_DIR, { recursive: true, mode: 0o700 });
    await writeFile(ID_FILE, owner, { mode: 0o600 });
    await writeAlive();
    alive = setInterval(() => void writeAlive(), 15_000);
    while (!stopping) {
      try {
        if (activity) {
          const current = await activity.poll();
          const arrived = [...current].filter((id) => !viewers.has(id));
          viewers = current;
          if (arrived.length) {
            await pullForward(arrived);
            idleWakeAt = 0;
          }
        }
        const wasFast = fast;
        fast = !activity || viewers.size > 0;
        await runAlerts(fast);
        await runPositionViews(fast);

        if (fast) {
          if (!wasFast) await workerHeartbeat(owner);
          if (Date.now() - lastMaintenance > MAINTENANCE_MS) {
            await maintenance();
            lastMaintenance = Date.now();
          }
          const ran = await runOneJob(isActive);
          await requestWalletSyncs();
          if (!ran) {
            await flushCapitalSnapshots(isActive);
            await sleep(2000);
          }
          continue;
        }

        // Idle: one database window per slot, nothing in between.
        if (Date.now() >= idleWakeAt) {
          const slot = nextIdleSlot();
          await workerHeartbeat(
            owner,
            slot.getTime() - Date.now() + IDLE_LEASE_MARGIN_MS,
          );
          await maintenance();
          lastMaintenance = Date.now();
          while (!stopping && (await runOneJob(isActive))) {
            /* drain everything due in this slot */
          }
          await requestWalletSyncs();
          await flushCapitalSnapshots(isActive, true);
          const due = (await earliestDueAt())?.getTime() ?? slot.getTime();
          idleWakeAt = Math.min(
            slot.getTime(),
            Math.max(due, Date.now() + MIN_IDLE_WAKE_MS),
          );
          // Close pooled connections so they cannot keep the compute awake.
          await prisma.$disconnect();
        }
        await sleep(
          Math.max(0, Math.min(ACTIVITY_POLL_MS, idleWakeAt - Date.now())),
        );
      } catch {
        console.error(
          "[exchange-worker] Cycle failed; retrying. Provider details redacted.",
        );
        await sleep(5000);
      }
    }
  } finally {
    clearInterval(heartbeat);
    clearInterval(alive);
    await unlink(ALIVE_FILE).catch(() => {});
    await unlink(ID_FILE).catch(() => {});
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
