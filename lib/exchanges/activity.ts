import { timingSafeEqual } from "node:crypto";
import { getCache } from "@vercel/functions";
import { ACTIVITY_GRACE_MS, ACTIVITY_TTL_MS } from "./config";

/**
 * Who is looking at exchange data right now. Kept in the Vercel Runtime Cache,
 * not PostgreSQL, so the worker can ask without waking the database.
 */
export type ExchangeActivity = Record<string, { since: number; until: number }>;

const KEY = "exchange-activity:v1";
const WRITE_EVERY_MS = 60_000;
const local = new Map<string, { since: number; writtenAt: number }>();

export function pruneActivity(
  value: unknown,
  now = Date.now(),
): ExchangeActivity {
  const result: ExchangeActivity = {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  for (const [userId, entry] of Object.entries(value)) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.since === "number" &&
      typeof entry.until === "number" &&
      entry.until > now
    )
      result[userId] = { since: entry.since, until: entry.until };
  }
  return result;
}

/** Records a viewer at most once a minute per instance; returns when the visit began. */
export async function markExchangeActivity(
  userId: string,
  now = Date.now(),
): Promise<number> {
  const known = local.get(userId);
  if (known && now - known.writtenAt < WRITE_EVERY_MS) return known.since;
  if (local.size > 1000) local.clear();
  try {
    const cache = getCache();
    const current = pruneActivity(await cache.get(KEY), now);
    const since =
      current[userId]?.since ??
      (known && now - known.writtenAt < ACTIVITY_TTL_MS ? known.since : now);
    current[userId] = { since, until: now + ACTIVITY_TTL_MS };
    await cache.set(KEY, current, {
      ttl: Math.ceil(ACTIVITY_TTL_MS / 1000) + 60,
      name: "exchange-activity",
    });
    local.set(userId, { since, writtenAt: now });
    return since;
  } catch {
    // Losing the signal only delays the fast cadence until the next idle slot.
    return known?.since ?? now;
  }
}

export async function readExchangeActivity(
  now = Date.now(),
): Promise<ExchangeActivity> {
  return pruneActivity(await getCache().get(KEY), now);
}

/** True while data from the last idle slot is still expected to be refreshing. */
export function withinActivityGrace(since: number, now = Date.now()) {
  return now - since < ACTIVITY_GRACE_MS;
}

export function workerSignalAuthorized(header: string | null): boolean {
  const secret = (process.env.EXCHANGE_WORKER_SIGNAL_SECRET ?? "").trim();
  if (secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
