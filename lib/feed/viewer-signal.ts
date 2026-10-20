const POLL_TIMEOUT_MS = 5000;

/**
 * Listener side of the viewer signal. Returns null when the signal is not
 * configured, in which case the listener keeps writing every post at once.
 */
export function createFeedViewerSignal(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): { poll(now?: number): Promise<boolean> } | null {
  const url = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.EXCHANGE_WORKER_SIGNAL_SECRET?.trim();
  if (!url || !secret) return null;
  let lastKnown = true;
  return {
    async poll(now = Date.now()) {
      try {
        const res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        const until =
          body && typeof body === "object" && "feedUntil" in body
            ? (body as { feedUntil: unknown }).feedUntil
            : null;
        if (until !== null && typeof until !== "number")
          throw new Error("Malformed activity response");
        lastKnown = until !== null && until > now;
      } catch {
        // Unknown means watched: posts are written at once rather than delayed.
        lastKnown = true;
      }
      return lastKnown;
    },
  };
}
