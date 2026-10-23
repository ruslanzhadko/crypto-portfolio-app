import { getCache } from "@vercel/functions";

/**
 * When each user's newest alert fired, kept in the Vercel Runtime Cache so the "new alerts" dot
 * can be polled without waking PostgreSQL. The VM reports every alert it records; a cache miss
 * reads the log once and stores the answer.
 */
const TTL_SECONDS = 30 * 86400;
const key = (userId: string) => `alerts-latest:v1:${userId}`;

export async function markAlertFired(userId: string, at = Date.now()): Promise<void> {
  try {
    await getCache().set(key(userId), { at }, { ttl: TTL_SECONDS, name: "alerts-latest" });
  } catch {
    // Without the signal the dot appears after the cached value expires.
  }
}

/** Moment of the newest alert (null: none yet); `load` is called only on a cache miss. */
export async function readLatestAlert(
  userId: string,
  load: () => Promise<number | null>,
): Promise<number | null> {
  const cached: unknown = await getCache().get(key(userId)).catch(() => undefined);
  if (cached && typeof cached === "object" && "at" in cached) {
    const at = (cached as { at: unknown }).at;
    if (at === null || typeof at === "number") return at;
  }
  const at = await load();
  try {
    await getCache().set(key(userId), { at }, { ttl: TTL_SECONDS, name: "alerts-latest" });
  } catch {
    // Next request reads the log again.
  }
  return at;
}
