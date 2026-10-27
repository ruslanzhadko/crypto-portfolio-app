import type { ChainAllocation } from "@/lib/services/portfolio";
import type { ExchangeHolding } from "@/lib/portfolio/unified-assets";

const EXCHANGE_COLORS: Record<string, string> = {
  binance: "#f3ba2f",
  bybit: "#f7a600",
  gate: "#2354e6",
  okx: "#d4d4d8",
  bingx: "#2a5ada",
  bitget: "#00c8d7",
  hyperliquid: "#97fce4",
  aster: "#e8a95b",
};

/**
 * Exchange balances grouped by exchange, in the same shape as the per-network
 * allocation so one bar chart shows networks, exchanges or both.
 */
export function exchangeAllocation(
  holdings: ExchangeHolding[],
  names: Record<string, string>,
): ChainAllocation[] {
  const byExchange = new Map<string, { total: number; symbols: Set<string> }>();
  for (const h of holdings) {
    const entry = byExchange.get(h.exchange) ?? { total: 0, symbols: new Set() };
    entry.total += h.usdValue;
    entry.symbols.add(h.symbol.toUpperCase());
    byExchange.set(h.exchange, entry);
  }
  return combineAllocations(
    [...byExchange].map(([exchange, { total, symbols }]) => ({
      chainName: `exchange:${exchange}`,
      displayName: names[exchange] ?? exchange,
      color: EXCHANGE_COLORS[exchange] ?? "#8888a8",
      totalUsd: total,
      share: 0,
      tokenCount: symbols.size,
    })),
  );
}

/** Joins allocation lists, recomputing shares against their common total. */
export function combineAllocations(
  ...lists: ChainAllocation[][]
): ChainAllocation[] {
  const rows = lists.flat();
  const total = rows.reduce((s, r) => s + r.totalUsd, 0);
  return rows
    .map((r) => ({ ...r, share: total > 0 ? (r.totalUsd / total) * 100 : 0 }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}
