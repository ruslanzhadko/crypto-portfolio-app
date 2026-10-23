import { getCache } from "@vercel/functions";
import type { CapitalSummary } from "./capital-summary";

/**
 * The header pill reads the summary from the Runtime Cache; the database is read at most once per
 * TTL per user, and the dashboard refreshes the cached value whenever it loads the full overview.
 */
const TTL_SECONDS = 120;
const key = (userId: string) => `capital-summary:v1:${userId}`;

export async function cacheCapitalSummary(userId: string, summary: CapitalSummary): Promise<void> {
  try {
    await getCache().set(key(userId), summary, { ttl: TTL_SECONDS, name: "capital-summary" });
  } catch {
    // The next pill request computes it again.
  }
}

export async function readCapitalSummary(
  userId: string,
  load: () => Promise<CapitalSummary>,
): Promise<CapitalSummary> {
  const cached: unknown = await getCache().get(key(userId)).catch(() => undefined);
  if (cached && typeof cached === "object" && "totalUsd" in cached) return cached as CapitalSummary;
  const summary = await load();
  await cacheCapitalSummary(userId, summary);
  return summary;
}
