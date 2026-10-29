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
  coingeckoPlatform: string | null;
  coingeckoNativeId: string;
  /** Логотип нативного токена — Trust Wallet CDN, стабільні URL */
  nativeLogoUrl: string;
  /** Логотип самого блокчейну (відрізняється для Arbitrum/Optimism/Base) */
  chainLogoUrl: string;
  color: string;
  network: Network; // EVM, SOLANA або TON
}

const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';
const ETH_LOGO = `${TW}/ethereum/info/logo.png`;

export const EVM_CHAINS: ChainInfo[] = [
  {
    chainName: 'hyperevm', displayName: 'HyperEVM', symbol: 'HYPE', chainId: '0x3e7',
    coingeckoPlatform: 'hyperevm', coingeckoNativeId: 'hyperliquid',
    nativeLogoUrl: '/hyperliquid-logo.png', chainLogoUrl: '/hyperliquid-logo.png',
    color: '#97fce4', network: Network.EVM,
  },
  {
    chainName: 'robinhood',
    displayName: 'Robinhood',
    symbol: 'ETH',
    chainId: '0x1237',
    coingeckoPlatform: null,
    coingeckoNativeId: 'ethereum',
    nativeLogoUrl: ETH_LOGO,
    chainLogoUrl: '/robinhood-logo.png',
    color: '#ccff00',
    network: Network.EVM,
  },
  {
    chainName: 'ethereum',
    displayName: 'Ethereum',
    symbol: 'ETH',
    chainId: '0x1',
    coingeckoPlatform: 'ethereum',
    coingeckoNativeId: 'ethereum',
    nativeLogoUrl: ETH_LOGO,
    chainLogoUrl: ETH_LOGO,
    color: '#627eea',
    network: Network.EVM,
  },
  {
    chainName: 'bsc',
    displayName: 'BNB Chain',
    symbol: 'BNB',
    chainId: '0x38',
    coingeckoPlatform: 'binance-smart-chain',
    coingeckoNativeId: 'binancecoin',
    nativeLogoUrl: `${TW}/smartchain/info/logo.png`,
    chainLogoUrl: `${TW}/smartchain/info/logo.png`,
    color: '#f3ba2f',
    network: Network.EVM,
  },
  {
    chainName: 'polygon',
    displayName: 'Polygon',
    symbol: 'POL',
    chainId: '0x89',
    coingeckoPlatform: 'polygon-pos',
    coingeckoNativeId: 'matic-network',
    nativeLogoUrl: `${TW}/polygon/info/logo.png`,
    chainLogoUrl: `${TW}/polygon/info/logo.png`,
    color: '#8247e5',
    network: Network.EVM,
  },
  {
    chainName: 'arbitrum',
    displayName: 'Arbitrum',
    symbol: 'ETH',
    chainId: '0xa4b1',
    coingeckoPlatform: 'arbitrum-one',
    coingeckoNativeId: 'ethereum',
    nativeLogoUrl: ETH_LOGO,
    chainLogoUrl: `${TW}/arbitrum/info/logo.png`,
    color: '#28a0f0',
    network: Network.EVM,
  },
  {
    chainName: 'optimism',
    displayName: 'Optimism',
    symbol: 'ETH',
    chainId: '0xa',
    coingeckoPlatform: 'optimistic-ethereum',
    coingeckoNativeId: 'ethereum',
    nativeLogoUrl: ETH_LOGO,
    chainLogoUrl: `${TW}/optimism/info/logo.png`,
    color: '#ff0420',
    network: Network.EVM,
  },
  {
    chainName: 'base',
    displayName: 'Base',
    symbol: 'ETH',
    chainId: '0x2105',
    coingeckoPlatform: 'base',
    coingeckoNativeId: 'ethereum',
    nativeLogoUrl: ETH_LOGO,
    chainLogoUrl: `${TW}/base/info/logo.png`,
    color: '#0052ff',
    network: Network.EVM,
  },
  {
    chainName: 'avalanche',
    displayName: 'Avalanche',
    symbol: 'AVAX',
    chainId: '0xa86a',
    coingeckoPlatform: 'avalanche',
    coingeckoNativeId: 'avalanche-2',
    nativeLogoUrl: `${TW}/avalanchec/info/logo.png`,
    chainLogoUrl: `${TW}/avalanchec/info/logo.png`,
    color: '#e84142',
    network: Network.EVM,
  },
  {
    chainName: 'xlayer',
    displayName: 'X Layer',
    symbol: 'OKB',
    chainId: '0xc4',
    coingeckoPlatform: null,
    coingeckoNativeId: 'okb',
    nativeLogoUrl: '/okx-logo-black-and-white.png',
    chainLogoUrl: '/okx-logo-black-and-white.png',
    color: '#ffffff',
    network: Network.EVM,
  },
];

export const HYPERCORE_CHAINS: ChainInfo[] = [
  { chainName: 'hypercore', displayName: 'HyperCore Spot', symbol: 'HYPE', chainId: null,
    coingeckoPlatform: null, coingeckoNativeId: 'hyperliquid',
    nativeLogoUrl: '/hyperliquid-logo.png', chainLogoUrl: '/hyperliquid-logo.png',
    color: '#62d9ba', network: Network.EVM },
  { chainName: 'hypercore-perps', displayName: 'HyperCore Perps', symbol: 'USD', chainId: null,
    coingeckoPlatform: null, coingeckoNativeId: 'usd-coin',
    nativeLogoUrl: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`,
    chainLogoUrl: '/hyperliquid-logo.png', color: '#39b899', network: Network.EVM },
];

export const SOLANA_CHAIN: ChainInfo = {
  chainName: 'solana',
  displayName: 'Solana',
  symbol: 'SOL',
  chainId: null,
  coingeckoPlatform: 'solana',
  coingeckoNativeId: 'solana',
  nativeLogoUrl: `${TW}/solana/info/logo.png`,
  chainLogoUrl: `${TW}/solana/info/logo.png`,
  color: '#14f195',
  network: Network.SOLANA,
};

/** TON's native coin is Gram (GRAM), renamed from Toncoin in June 2026; CoinGecko keeps the old id. */
export const TON_CHAIN: ChainInfo = {
  chainName: 'ton',
  displayName: 'TON',
  symbol: 'GRAM',
  chainId: null,
  coingeckoPlatform: 'the-open-network',
  coingeckoNativeId: 'the-open-network',
  nativeLogoUrl: 'https://coin-images.coingecko.com/coins/images/17980/small/Gram_Circular_Badge.png',
  chainLogoUrl: `${TW}/ton/info/logo.png`,
  color: '#0098ea',
  network: Network.TON,
};

export const ALL_CHAINS: ChainInfo[] = [...EVM_CHAINS, ...HYPERCORE_CHAINS, SOLANA_CHAIN, TON_CHAIN];

const CHAIN_MAP = new Map<string, ChainInfo>(ALL_CHAINS.map((c) => [c.chainName, c]));

/**
 * Networks seen only in exchange deposits and withdrawals: a name and a logo for the badge, no
 * wallet support. Keys are what `transferChain` (lib/exchanges/transfer-networks.ts) returns.
 */
const EXTRA_NETWORKS: Record<string, { displayName: string; logo: string }> = {
  tron: { displayName: 'Tron', logo: `${TW}/tron/info/logo.png` },
  plasma: { displayName: 'Plasma', logo: `${TW}/plasma/info/logo.png` },
  aptos: { displayName: 'Aptos', logo: `${TW}/aptos/info/logo.png` },
  sui: { displayName: 'Sui', logo: `${TW}/sui/info/logo.png` },
  bitcoin: { displayName: 'Bitcoin', logo: `${TW}/bitcoin/info/logo.png` },
  linea: { displayName: 'Linea', logo: `${TW}/linea/info/logo.png` },
  zksync: { displayName: 'zkSync Era', logo: `${TW}/zksync/info/logo.png` },
  scroll: { displayName: 'Scroll', logo: `${TW}/scroll/info/logo.png` },
  mantle: { displayName: 'Mantle', logo: `${TW}/mantle/info/logo.png` },
  near: { displayName: 'NEAR', logo: `${TW}/near/info/logo.png` },
  celo: { displayName: 'Celo', logo: `${TW}/celo/info/logo.png` },
  sei: { displayName: 'Sei', logo: `${TW}/sei/info/logo.png` },
  sonic: { displayName: 'Sonic', logo: `${TW}/sonic/info/logo.png` },
  opbnb: { displayName: 'opBNB', logo: `${TW}/opbnb/info/logo.png` },
  cardano: { displayName: 'Cardano', logo: `${TW}/cardano/info/logo.png` },
  litecoin: { displayName: 'Litecoin', logo: `${TW}/litecoin/info/logo.png` },
  polkadot: { displayName: 'Polkadot', logo: `${TW}/polkadot/info/logo.png` },
  cosmos: { displayName: 'Cosmos Hub', logo: `${TW}/cosmos/info/logo.png` },
};

/** Badge logo of a wallet chain or of a network known only from exchange transfers. */
export function getChainLogoUrl(chainName: string): string | null {
  return CHAIN_MAP.get(chainName)?.chainLogoUrl ?? EXTRA_NETWORKS[chainName]?.logo ?? null;
}

export function getChainInfo(chainName: string): ChainInfo | null {
  return CHAIN_MAP.get(chainName) ?? null;
}

export function getChainsByNetwork(network: Network): ChainInfo[] {
  if (network === Network.EVM) return EVM_CHAINS;
  if (network === Network.TON) return [TON_CHAIN];
  return [SOLANA_CHAIN];
}

export function getChainColor(chainName: string): string {
  return CHAIN_MAP.get(chainName)?.color ?? '#6c63ff';
}

export function getChainDisplayName(chainName: string): string {
  return CHAIN_MAP.get(chainName)?.displayName ?? EXTRA_NETWORKS[chainName]?.displayName ?? chainName;
}
