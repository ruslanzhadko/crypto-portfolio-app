/** Short capital summary for the header pill; pure, shared by the server and the browser. */
export interface CapitalSummary {
  /** Decimal string, wallets plus included exchange accounts. */
  totalUsd: string;
  /** Unrealized PnL of open positions; null when unknown or there are none. */
  pnlUsd: string | null;
  positions: number;
  stale: boolean;
  /** Which wallets and accounts the total covers; null for wallet-only users. */
  sourceSet: string | null;
}

/** Capital about 24 hours ago. */
export interface DayAgoCapital {
  totalUsd: string;
  sourceSet: string | null;
}

/**
 * Change of capital over 24 hours. Skipped when wallets or accounts were added or removed since
 * then: the difference would be the new source, not a gain or loss.
 */
export function dailyChange(
  summary: CapitalSummary,
  dayAgo: DayAgoCapital | null,
): { usd: number; percent: number | null } | null {
  if (!dayAgo || (dayAgo.sourceSet !== null && dayAgo.sourceSet !== summary.sourceSet)) return null;
  const before = Number(dayAgo.totalUsd);
  const usd = Number(summary.totalUsd) - before;
  if (!Number.isFinite(usd)) return null;
  return { usd, percent: before > 0 ? (usd / before) * 100 : null };
}

export function summarizeOverview(overview: {
  totalUsd: string;
  unrealizedPnlUsd: string | null;
  positionCount: number;
  stale: boolean;
  sourceSet: string;
}): CapitalSummary {
  return {
    totalUsd: overview.totalUsd,
    pnlUsd: overview.positionCount > 0 ? overview.unrealizedPnlUsd : null,
    positions: overview.positionCount,
    stale: overview.stale,
    sourceSet: overview.sourceSet,
  };
}
