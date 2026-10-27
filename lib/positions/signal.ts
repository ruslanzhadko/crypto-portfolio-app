import { getCache } from "@vercel/functions";

/**
 * Tells the exchange worker that position alert settings changed, through the Vercel Runtime
 * Cache (never PostgreSQL), so it reloads them within seconds instead of at the next window.
 */
const KEY = "position-alerts-version:v1";
const TTL_SECONDS = 7 * 86400;

export async function markPositionAlertsChanged(now = Date.now()): Promise<void> {
  try {
    await getCache().set(KEY, { at: now }, { ttl: TTL_SECONDS, name: "position-alerts" });
  } catch {
    // Losing the signal only delays the change until the next database window.
  }
}

export async function readPositionAlertsVersion(): Promise<number | null> {
  const value = await getCache().get(KEY);
  const at =
    value && typeof value === "object" && "at" in value
      ? (value as { at: unknown }).at
      : null;
  return typeof at === "number" ? at : null;
}
