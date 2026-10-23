import { getCache } from "@vercel/functions";
import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import type { DayAgoCapital } from "./capital-summary";

/**
 * Capital about 24 hours ago for the header pill's daily change. One indexed row, cached for ten
 * minutes: the reference moves slowly, so the database is not read on every pill poll.
 */
const TTL_SECONDS = 600;
const key = (userId: string) => `capital-day-ago:v1:${userId}`;

export async function readDayAgoCapital(userId: string, now = Date.now()): Promise<DayAgoCapital | null> {
  const cached: unknown = await getCache().get(key(userId)).catch(() => undefined);
  if (cached && typeof cached === "object" && "value" in cached) return (cached as { value: DayAgoCapital | null }).value;
  // The closest snapshot taken 24–26 h ago; none (a new user, a gap) means no daily change.
  const to = new Date(now - 24 * 3600_000);
  const from = new Date(now - 26 * 3600_000);
  let value: DayAgoCapital | null = null;
  if (exchangesEnabled(userId)) {
    const row = await prisma.portfolioCapitalSnapshot.findFirst({
      where: { userId, complete: true, bucket: { gte: from, lte: to } },
      orderBy: { bucket: "desc" },
      select: { totalUsd: true, sourceSet: true },
    });
    if (row) value = { totalUsd: row.totalUsd.toFixed(), sourceSet: row.sourceSet };
  } else {
    const row = await prisma.portfolioSnapshot.findFirst({
      where: { userId, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "desc" },
      select: { totalUsd: true },
    });
    if (row) value = { totalUsd: String(row.totalUsd), sourceSet: null };
  }
  try {
    await getCache().set(key(userId), { value }, { ttl: TTL_SECONDS, name: "capital-day-ago" });
  } catch {
    // Read again on the next poll.
  }
  return value;
}
