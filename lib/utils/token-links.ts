const DEX_CHAIN_BY_INTERNAL: Record<string, string> = {
  solana: 'solana',
  ethereum: 'ethereum',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  avalanche: 'avalanche',
  xlayer: 'xlayer',
};

export function getDexScreenerChainId(chainName: string): string | null {
  return DEX_CHAIN_BY_INTERNAL[chainName] ?? null;
}

export function getTokenPageUrl(token: {
  chainName: string;
  tokenAddress: string;
  coingeckoId?: string | null;
}): { href: string; external: boolean } | null {
  const dexChain = getDexScreenerChainId(token.chainName);
  if (token.tokenAddress && dexChain) {
    return {
      href: `https://dexscreener.com/${dexChain}/${token.tokenAddress}`,
      external: true,
    };
  }
  if (token.coingeckoId) {
    return { href: `/market/${token.coingeckoId}`, external: false };
  }
  return null;
}
