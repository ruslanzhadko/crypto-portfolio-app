import { Network } from '@prisma/client';

// ─────────────────────────────────────────
// Інформація про конкретні блокчейн-ланцюги
// chainName — внутрішній ідентифікатор (lowercase рядок)
// ─────────────────────────────────────────

export interface ChainInfo {
  chainName: string;
  displayName: string;
  symbol: string;
  chainId: string | null;
  moralisId: string;
  coingeckoPlatform: string | null;
  coingeckoNativeId: string;
  color: string;
  network: Network; // EVM або SOLANA
}

export const EVM_CHAINS: ChainInfo[] = [
  {
    chainName: 'ethereum',
    displayName: 'Ethereum',
    symbol: 'ETH',
    chainId: '0x1',
    moralisId: 'eth',
    coingeckoPlatform: 'ethereum',
    coingeckoNativeId: 'ethereum',
    color: '#627eea',
    network: Network.EVM,
  },
  {
    chainName: 'bsc',
    displayName: 'BNB Chain',
    symbol: 'BNB',
    chainId: '0x38',
    moralisId: 'bsc',
    coingeckoPlatform: 'binance-smart-chain',
    coingeckoNativeId: 'binancecoin',
    color: '#f3ba2f',
    network: Network.EVM,
  },
  {
    chainName: 'polygon',
    displayName: 'Polygon',
    symbol: 'POL',
    chainId: '0x89',
    moralisId: 'polygon',
    coingeckoPlatform: 'polygon-pos',
    coingeckoNativeId: 'matic-network',
    color: '#8247e5',
    network: Network.EVM,
  },
  {
    chainName: 'arbitrum',
    displayName: 'Arbitrum',
    symbol: 'ETH',
    chainId: '0xa4b1',
    moralisId: 'arbitrum',
    coingeckoPlatform: 'arbitrum-one',
    coingeckoNativeId: 'ethereum',
    color: '#28a0f0',
    network: Network.EVM,
  },
  {
    chainName: 'optimism',
    displayName: 'Optimism',
    symbol: 'ETH',
    chainId: '0xa',
    moralisId: 'optimism',
    coingeckoPlatform: 'optimistic-ethereum',
    coingeckoNativeId: 'ethereum',
    color: '#ff0420',
    network: Network.EVM,
  },
  {
    chainName: 'base',
    displayName: 'Base',
    symbol: 'ETH',
    chainId: '0x2105',
    moralisId: 'base',
    coingeckoPlatform: 'base',
    coingeckoNativeId: 'ethereum',
    color: '#0052ff',
    network: Network.EVM,
  },
  {
    chainName: 'avalanche',
    displayName: 'Avalanche',
    symbol: 'AVAX',
    chainId: '0xa86a',
    moralisId: 'avalanche',
    coingeckoPlatform: 'avalanche',
    coingeckoNativeId: 'avalanche-2',
    color: '#e84142',
    network: Network.EVM,
  },
];

export const SOLANA_CHAIN: ChainInfo = {
  chainName: 'solana',
  displayName: 'Solana',
  symbol: 'SOL',
  chainId: null,
  moralisId: 'mainnet',
  coingeckoPlatform: 'solana',
  coingeckoNativeId: 'solana',
  color: '#14f195',
  network: Network.SOLANA,
};

export const ALL_CHAINS: ChainInfo[] = [...EVM_CHAINS, SOLANA_CHAIN];

const CHAIN_MAP = new Map<string, ChainInfo>(ALL_CHAINS.map((c) => [c.chainName, c]));

export function getChainInfo(chainName: string): ChainInfo | null {
  return CHAIN_MAP.get(chainName) ?? null;
}

export function getChainsByNetwork(network: Network): ChainInfo[] {
  if (network === Network.EVM) return EVM_CHAINS;
  return [SOLANA_CHAIN];
}

export function getChainColor(chainName: string): string {
  return CHAIN_MAP.get(chainName)?.color ?? '#6c63ff';
}

export function getChainDisplayName(chainName: string): string {
  return CHAIN_MAP.get(chainName)?.displayName ?? chainName;
}
