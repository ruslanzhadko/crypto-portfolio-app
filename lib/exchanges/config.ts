import { isDemoUser } from "@/lib/demo/config";

/** Server-side rollout switch. No table access while disabled. */
export function exchangesEnabled(userId?: string): boolean {
  if (process.env.EXCHANGES_ENABLED !== "true") return false;
  const pilot = (process.env.EXCHANGES_PILOT_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // The read-only demo account always shows its sample exchanges, pilot or not.
  return !pilot.length || (!!userId && (pilot.includes(userId) || isDemoUser(userId)));
}

export const POSITION_INTERVAL_MS = 30_000;
export const BALANCE_INTERVAL_MS = 120_000;
export const LEASE_MS = 180_000;
export const MAX_CONNECTIONS = 10;
export const HYPERCORE_CHAINS = ["hypercore", "hypercore-perps"];

/** Without viewers the worker syncs everything once per aligned slot, letting Neon scale to zero. */
export const IDLE_SYNC_MS = 30 * 60_000;
/** A viewer keeps the fast cadence for this long after the last exchange API request. */
export const ACTIVITY_TTL_MS = 10 * 60_000;
export const ACTIVITY_POLL_MS = 10_000;
const STALE_FUTURES_MS = 90_000;
const STALE_SPOT_MS = 300_000;
const IDLE_STALE_MS = IDLE_SYNC_MS + 10 * 60_000;
/** Right after a viewer arrives, data from the last idle slot is expected, not stale. */
export const ACTIVITY_GRACE_MS = 120_000;

export function staleLimits(relaxed: boolean) {
  return relaxed
    ? { spot: IDLE_STALE_MS, futures: IDLE_STALE_MS }
    : { spot: STALE_SPOT_MS, futures: STALE_FUTURES_MS };
}
export function nextIdleSlot(now = Date.now()): Date {
  return new Date((Math.floor(now / IDLE_SYNC_MS) + 1) * IDLE_SYNC_MS);
}
