import { getCache } from "@vercel/functions";

/**
 * Tells the VM that price alerts changed, through the Vercel Runtime Cache (never PostgreSQL),
 * so it reloads its in-memory rules within a minute instead of waiting for the next window.
 */
const KEY = "price-triggers-version:v1";
const TTL_SECONDS = 7 * 86400;

export async function markTriggersChanged(now = Date.now()): Promise<void> {
  try {
    await getCache().set(KEY, { at: now }, { ttl: TTL_SECONDS, name: "price-triggers" });
  } catch {
    // Losing the signal only delays the change until the next database window.
  }
}

/** Moment of the last change, or null when nothing changed recently. */
export async function readTriggersVersion(): Promise<number | null> {
  const value = await getCache().get(KEY);
  const at =
    value && typeof value === "object" && "at" in value
      ? (value as { at: unknown }).at
      : null;
  return typeof at === "number" ? at : null;
}

/** VM side: asks the activity endpoint for the version; null when unknown or not configured. */
export function createTriggersVersionClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): { poll(): Promise<number | null> } | null {
  const url = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.EXCHANGE_WORKER_SIGNAL_SECRET?.trim();
  if (!url || !secret) return null;
  return {
    async poll() {
      try {
        const res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const body: unknown = await res.json();
        const version =
          body && typeof body === "object" && "triggersVersion" in body
            ? (body as { triggersVersion: unknown }).triggersVersion
            : null;
        return typeof version === "number" ? version : null;
      } catch {
        return null;
      }
    },
  };
}
