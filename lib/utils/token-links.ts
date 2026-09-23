import { COINGECKO_ID_BY_SOLANA_MINT } from './known-solana-tokens';

const DEX_CHAIN_BY_INTERNAL: Record<string, string> = {
  solana: 'solana',
  ethereum: 'ethereum',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  robinhood: 'robinhood',
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
  // Solana metadata can carry an old symbol-matched ID. Trust only known exact mints.
  const marketId = token.chainName === 'solana' && token.tokenAddress
    ? COINGECKO_ID_BY_SOLANA_MINT[token.tokenAddress] === token.coingeckoId
      ? token.coingeckoId
      : null
    : token.coingeckoId;
  if (marketId) {
    return { href: `/market/${marketId}`, external: false };
  }
  const dexChain = getDexScreenerChainId(token.chainName);
  if (token.tokenAddress && dexChain) {
    return {
      href: `https://dexscreener.com/${dexChain}/${token.tokenAddress}`,
      external: true,
    };
  }
  return null;
}

export function getTokenDetailReturn(from: string | undefined): {
  href: string;
  label: 'backToWallet' | 'backToDashboard' | 'backToMarket';
} {
  if (from?.startsWith('wallet:')) {
    const walletId = from.slice('wallet:'.length);
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(walletId)) {
      return { href: `/wallets/${walletId}`, label: 'backToWallet' };
    }
  }
  if (from === 'dashboard') {
    return { href: '/dashboard', label: 'backToDashboard' };
  }
  return { href: '/market', label: 'backToMarket' };
}
