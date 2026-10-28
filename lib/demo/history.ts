import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const HOUR = 3600_000;
const DAYS = 30;

type Point = {
  totalUsd: string;
  walletsUsd: string;
  exchangesUsd: string;
  sourceSet: string;
  sources: { id: string; kind: string; valueUsd: string | null }[];
};

/** A gentle walk ending at today's value: a slow wave plus a small upward drift. */
export function demoFactor(hoursAgo: number) {
  return (
    1 +
    0.045 * Math.sin(hoursAgo / 60) +
    0.025 * Math.sin(hoursAgo / 13) -
    hoursAgo * 0.00012
  );
}

const scaled = (value: string | null, factor: number) =>
  value === null ? null : (Number(value) * factor).toFixed(2);

/**
 * Thirty days of hourly capital history for the demo account, made from its current point (same
 * sources, so the chart joins the live points). Runs once: nothing happens while older history
 * exists.
 */
export async function ensureDemoHistory(
  userId: string,
  current: Point,
  now = Date.now(),
) {
  const old = await prisma.portfolioCapitalSnapshot.findFirst({
    where: { userId, bucket: { lt: new Date(now - 24 * HOUR) } },
    select: { id: true },
  });
  if (old) return false;
  const lastHour = Math.floor(now / HOUR) * HOUR;
  await prisma.portfolioCapitalSnapshot.createMany({
    data: Array.from({ length: DAYS * 24 }, (_, i) => {
      const hoursAgo = DAYS * 24 - i;
      const factor = demoFactor(hoursAgo);
      return {
        userId,
        bucket: new Date(lastHour - hoursAgo * HOUR),
        totalUsd: new Prisma.Decimal(scaled(current.totalUsd, factor) ?? "0"),
        walletsUsd: new Prisma.Decimal(
          scaled(current.walletsUsd, factor) ?? "0",
        ),
        exchangesUsd: new Prisma.Decimal(
          scaled(current.exchangesUsd, factor) ?? "0",
        ),
        sourceSet: current.sourceSet,
        complete: true,
        sources: current.sources.map((s) => ({
          ...s,
          valueUsd: scaled(s.valueUsd, factor),
        })),
      };
    }),
    skipDuplicates: true,
  });
  return true;
}
