import type { AggregatedToken } from '@/lib/services/portfolio';

/** Keep token amounts aligned with the selected network, not the unfiltered portfolio. */
export function filterDashboardTokens(
  tokens: AggregatedToken[],
  chainName: string,
  search: string,
): AggregatedToken[] {
  const query = search.trim().toLocaleLowerCase();
  const portfolioTotal = tokens.reduce((sum, token) => sum + token.totalUsd, 0);

  return tokens.flatMap((token) => {
    if (query && ![token.symbol, token.name, token.tokenAddress]
      .some((value) => value.toLocaleLowerCase().includes(query))) return [];
    if (chainName === 'all') return [token];

    const wallets = token.wallets.filter((wallet) => wallet.chainName === chainName);
    if (wallets.length === 0) return [];
    const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    const totalUsd = wallets.reduce((sum, wallet) => sum + wallet.usdValue, 0);
    return [{
      ...token,
      chainName,
      chains: [chainName],
      walletIds: Array.from(new Set(wallets.map((wallet) => wallet.walletId))),
      wallets: wallets.map((wallet) => ({
        ...wallet,
        share: totalUsd > 0 ? (wallet.usdValue / totalUsd) * 100 : 0,
      })),
      totalBalance,
      totalUsd,
      currentPrice: totalBalance > 0 ? totalUsd / totalBalance : 0,
      priceChange24h: 0,
      share: portfolioTotal > 0 ? (totalUsd / portfolioTotal) * 100 : 0,
    }];
  });
}
