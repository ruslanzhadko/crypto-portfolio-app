/** Short capital summary for the header pill; pure, shared by the server and the browser. */
export interface CapitalSummary {
  /** Decimal string, wallets plus included exchange accounts. */
  totalUsd: string;
  /** Unrealized PnL of open positions; null when unknown or there are none. */
  pnlUsd: string | null;
  positions: number;
  stale: boolean;
}

export function summarizeOverview(overview: {
  totalUsd: string;
  unrealizedPnlUsd: string | null;
  positionCount: number;
  stale: boolean;
}): CapitalSummary {
  return {
    totalUsd: overview.totalUsd,
    pnlUsd: overview.positionCount > 0 ? overview.unrealizedPnlUsd : null,
    positions: overview.positionCount,
    stale: overview.stale,
  };
}
