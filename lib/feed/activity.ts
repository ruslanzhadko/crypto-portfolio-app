import { getCache } from "@vercel/functions";

/**
 * Whether anyone has the feed open right now. Kept in the Vercel Runtime Cache
 * (never PostgreSQL) so the listener can ask without waking the database.
 */
export const FEED_ACTIVITY_TTL_MS = 90_000;
const KEY = "feed-activity:v1";
const WRITE_EVERY_MS = 15_000;
let writtenAt = 0;

export async function markFeedActivity(now = Date.now()): Promise<void> {
  if (now - writtenAt < WRITE_EVERY_MS) return;
  writtenAt = now;
  try {
    await getCache().set(
      KEY,
      { until: now + FEED_ACTIVITY_TTL_MS },
      { ttl: Math.ceil(FEED_ACTIVITY_TTL_MS / 1000) + 30, name: "feed-activity" },
    );
  } catch {
    // Losing the signal only delays posts until the next scheduled flush.
    writtenAt = 0;
  }
}

/** Moment until which the feed counts as watched, or null when nobody is. */
export async function readFeedActivityUntil(
  now = Date.now(),
): Promise<number | null> {
  const value = await getCache().get(KEY);
  const until =
    value && typeof value === "object" && "until" in value
      ? (value as { until: unknown }).until
      : null;
  return typeof until === "number" && until > now ? until : null;
}
