'use client';

import { useEffect, useMemo, useState } from 'react';
import type { UnifiedToken } from '@/lib/portfolio/unified-assets';

/**
 * 24h change (percent) for tokens that exist only on exchanges: they have no CoinGecko data, so the
 * change comes from public exchange tickers. Keyed by upper-case ticker.
 */
export function useTickerChanges(tokens: UnifiedToken[]): Record<string, number> {
  const symbols = useMemo(
    () =>
      [...new Set(tokens.filter((tok) => tok.exchangeOnly).map((tok) => tok.symbol.toUpperCase()))]
        .sort((a, b) => a.localeCompare(b))
        .join(','),
    [tokens],
  );
  const [changes, setChanges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!symbols) return;
    const controller = new AbortController();
    fetch(`/api/market/changes?symbols=${encodeURIComponent(symbols)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { changes?: Record<string, number> } | null) => {
        if (body?.changes) setChanges(body.changes);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [symbols]);
  return changes;
}

/** The token's own 24h change, or the exchange ticker's for exchange-only tokens; null when unknown. */
export function tokenChange(tok: UnifiedToken, changes: Record<string, number>): number | null {
  if (tok.exchangeOnly) return changes[tok.symbol.toUpperCase()] ?? null;
  return tok.priceChange24h !== 0 ? tok.priceChange24h : null;
}
