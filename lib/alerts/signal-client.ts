/** VM side: tells the site an alert was recorded; never throws. */
export function createAlertSignalClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): { fired(userId: string, at: number): Promise<void> } | null {
  const activity = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.EXCHANGE_WORKER_SIGNAL_SECRET?.trim();
  if (!activity || !secret) return null;
  const url = new URL("/api/worker/alert", activity).toString();
  return {
    async fired(userId, at) {
      try {
        await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId, at }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // The site falls back to the log once its cached value expires.
      }
    },
  };
}
