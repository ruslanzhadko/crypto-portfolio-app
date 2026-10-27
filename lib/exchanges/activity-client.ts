import { ACTIVITY_POLL_MS, ACTIVITY_TTL_MS } from "./config";

export type ActivityClient = {
  /** Current viewers; polls the web app at most every ACTIVITY_POLL_MS. */
  poll(now?: number): Promise<Set<string>>;
  isActive(userId: string): boolean;
  /** Moment position alert settings last changed, from the same response; null when unknown. */
  positionAlertsVersion(): number | null;
};

type Fetch = typeof fetch;

/**
 * Worker side of the viewer signal. Without configuration the worker keeps the
 * legacy behaviour: every user is treated as active (always the fast cadence).
 */
export function createActivityClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: Fetch = fetch,
): ActivityClient | null {
  const url = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.EXCHANGE_WORKER_SIGNAL_SECRET?.trim();
  if (!url || !secret) return null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };
  // Lets the worker reach a protected Preview deployment.
  if (env.EXCHANGE_ACTIVITY_BYPASS)
    headers["x-vercel-protection-bypass"] = env.EXCHANGE_ACTIVITY_BYPASS;
  // Last time each user was reported; keeps viewers through a failed poll.
  const seen = new Map<string, number>();
  let polledAt = Number.NEGATIVE_INFINITY;
  let failures = 0;
  let alertsVersion: number | null = null;

  const active = (now: number) => {
    for (const [id, at] of seen) if (now - at > ACTIVITY_TTL_MS) seen.delete(id);
    return new Set(seen.keys());
  };

  return {
    async poll(now = Date.now()) {
      if (now - polledAt < ACTIVITY_POLL_MS) return active(now);
      polledAt = now;
      try {
        const res = await fetchImpl(url, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        const users =
          body &&
          typeof body === "object" &&
          "users" in body &&
          Array.isArray(body.users)
            ? body.users.filter((u): u is string => typeof u === "string")
            : null;
        if (!users) throw new Error("Malformed activity response");
        for (const id of users) seen.set(id, now);
        const version = (body as { positionAlertsVersion?: unknown }).positionAlertsVersion;
        alertsVersion = typeof version === "number" ? version : null;
        // A user missing from the response stopped viewing (entries expire there).
        for (const id of [...seen.keys()])
          if (!users.includes(id)) seen.delete(id);
        failures = 0;
      } catch {
        if (failures++ % 30 === 0)
          console.error(
            "[exchange-worker] Activity signal unavailable; keeping the last known viewers.",
          );
      }
      return active(now);
    },
    isActive(userId: string) {
      return seen.has(userId);
    },
    positionAlertsVersion() {
      return alertsVersion;
    },
  };
}
