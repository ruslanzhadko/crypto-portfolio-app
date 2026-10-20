export const FEED_FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 60_000;
const FAST_UNTIL_MS = 10 * 60_000;
const SLOW_UNTIL_MS = 30 * 60_000;

/**
 * Refresh interval for an open feed by time since the reader last did something.
 * An attentive reader gets near-live updates; a forgotten tab slows down and
 * stops (null) so it does not keep the database awake.
 */
export function feedPollDelay(idleMs: number): number | null {
  if (idleMs < FAST_UNTIL_MS) return FEED_FAST_POLL_MS;
  if (idleMs < SLOW_UNTIL_MS) return SLOW_POLL_MS;
  return null;
}
