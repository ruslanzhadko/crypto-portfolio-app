import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { tokenUserId } from "@/lib/auth/token-user";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { getCapitalOverview } from "@/lib/exchanges/portfolio";
import { summarizeOverview } from "@/lib/portfolio/capital-summary";
import { readCapitalSummary } from "@/lib/portfolio/capital-summary-cache";
import { readDayAgoCapital } from "@/lib/portfolio/capital-day-ago";

export const dynamic = "force-dynamic";

/**
 * Capital and open-position PnL for the header pill. Polled on every page, so it skips auth()'s
 * database round trip and serves a value cached for two minutes. It never marks the user as an
 * active exchange viewer: the worker stays in its slow mode on pages without exchange data.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const userId = await tokenUserId();
  if (!userId)
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  try {
    const summary = await readCapitalSummary(userId, async () => {
      if (exchangesEnabled(userId))
        return summarizeOverview(await getCapitalOverview(userId, { relaxed: true }));
      const wallets = await prisma.tokenBalance.aggregate({
        where: { wallet: { userId }, isSpam: false, isHidden: false },
        _sum: { usdValue: true },
      });
      return { totalUsd: String(wallets._sum.usdValue ?? 0), pnlUsd: null, positions: 0, stale: false, sourceSet: null };
    });
    const dayAgo = await readDayAgoCapital(userId);
    return NextResponse.json({ summary, dayAgo }, { headers });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE" } }, { status: 503, headers });
  }
}
