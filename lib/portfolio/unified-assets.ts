import type { AggregatedToken } from "@/lib/services/portfolio";

/** One priced coin balance on an exchange account. */
export interface ExchangeHolding {
  key: string;
  symbol: string;
  label: string;
  exchange: string;
  kind: string;
  amount: number;
  usdValue: number;
  priceUsd: number | null;
  /** "equity": a single-collateral Aster futures account shown at equity. */
  note?: "equity";
}

export interface UnifiedToken extends AggregatedToken {
  exchanges: ExchangeHolding[];
  /** No wallet token to merge with: the row exists only because of exchanges. */
  exchangeOnly: boolean;
}

/**
 * Merges exchange balances into the wallet token list by ticker. Exchanges
 * report only tickers, so a holding joins a wallet row only when every wallet
 * token with that ticker is the same asset (one CoinGecko ID); otherwise it
 * gets its own row rather than being mixed with a different token.
 */
export function mergeExchangeHoldings(
  tokens: AggregatedToken[],
  holdings: ExchangeHolding[],
): UnifiedToken[] {
  const rows: UnifiedToken[] = tokens.map((t) => ({
    ...t,
    exchanges: [],
    exchangeOnly: false,
  }));
  const bySymbol = new Map<string, UnifiedToken[]>();
  for (const row of rows) {
    const symbol = row.symbol.toUpperCase();
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), row]);
  }
  const holdingsBySymbol = new Map<string, ExchangeHolding[]>();
  for (const h of holdings) {
    const symbol = h.symbol.toUpperCase();
    holdingsBySymbol.set(symbol, [...(holdingsBySymbol.get(symbol) ?? []), h]);
  }
  for (const [symbol, group] of holdingsBySymbol) {
    const amount = group.reduce((s, h) => s + h.amount, 0);
    const usd = group.reduce((s, h) => s + h.usdValue, 0);
    const candidates = bySymbol.get(symbol) ?? [];
    const assets = new Set(candidates.map((c) => c.coingeckoId ?? c.key));
    if (candidates.length && assets.size === 1) {
      const target = candidates.reduce((a, b) =>
        b.totalUsd > a.totalUsd ? b : a,
      );
      target.exchanges.push(...group);
      target.totalBalance += amount;
      target.totalUsd += usd;
      continue;
    }
    const price =
      amount > 0 ? usd / amount : (group.find((h) => h.priceUsd)?.priceUsd ?? 0);
    rows.push({
      key: `exchange:${symbol}`,
      symbol: group[0]!.symbol,
      name: group[0]!.symbol,
      logoUrl: null,
      coingeckoId: null,
      chainName: "",
      tokenAddress: "",
      totalBalance: amount,
      totalUsd: usd,
      share: 0,
      chains: [],
      walletIds: [],
      wallets: [],
      currentPrice: price,
      priceChange24h: 0,
      exchanges: group,
      exchangeOnly: true,
    });
  }
  const total = rows.reduce((s, r) => s + r.totalUsd, 0);
  for (const row of rows) {
    row.share = total > 0 ? (row.totalUsd / total) * 100 : 0;
    row.exchanges.sort((a, b) => b.usdValue - a.usdValue);
  }
  return rows;
}
