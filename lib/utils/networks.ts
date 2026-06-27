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
  /** Логотип нативного токена — Trust Wallet CDN, стабільні URL */
  nativeLogoUrl: string;
  /** Логотип самого блокчейну (відрізняється для Arbitrum/Optimism/Base) */
  chainLogoUrl: string;
  color: string;
  network: Network; // EVM або SOLANA
}

const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';
const ETH_LOGO = `${TW}/ethereum/info/logo.png`;

export const EVM_CHAINS: ChainInfo[] = [
  {
    chainName: 'ethereum',
    displayName: 'Ethereum',
    symbol: 'ETH',
    chainId: '0x1',
    moralisId: 'eth',
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
    moralisId: 'bsc',
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
    moralisId: 'polygon',
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
    moralisId: 'arbitrum',
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
    moralisId: 'optimism',
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
    moralisId: 'base',
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
    moralisId: 'avalanche',
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
    moralisId: 'xlayer',
    coingeckoPlatform: null,
    coingeckoNativeId: 'okb',
    nativeLogoUrl: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/9a411426-3711-47d4-9c1a-dcf72973ddfc/dfj37e6-d8b49926-d115-4368-9de8-09a80077fb4f.png/v1/fill/w_1280,h_1280/okx_okb_logo_by_saphyl_dfj37e6-fullview.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTI4MCIsInBhdGgiOiIvZi85YTQxMTQyNi0zNzExLTQ3ZDQtOWMxYS1kY2Y3Mjk3M2RkZmMvZGZqMzdlNi1kOGI0OTkyNi1kMTE1LTQzNjgtOWRlOC0wOWE4MDA3N2ZiNGYucG5nIiwid2lkdGgiOiI8PTEyODAifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.kj-YHBfKkWEhIzIL28V3cVwkZtKVVwq_KsyFudWSew0',
    chainLogoUrl: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/9a411426-3711-47d4-9c1a-dcf72973ddfc/dfj37e6-d8b49926-d115-4368-9de8-09a80077fb4f.png/v1/fill/w_1280,h_1280/okx_okb_logo_by_saphyl_dfj37e6-fullview.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTI4MCIsInBhdGgiOiIvZi85YTQxMTQyNi0zNzExLTQ3ZDQtOWMxYS1kY2Y3Mjk3M2RkZmMvZGZqMzdlNi1kOGI0OTkyNi1kMTE1LTQzNjgtOWRlOC0wOWE4MDA3N2ZiNGYucG5nIiwid2lkdGgiOiI8PTEyODAifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.kj-YHBfKkWEhIzIL28V3cVwkZtKVVwq_KsyFudWSew0',
    color: '#ffffff',
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
  nativeLogoUrl: `${TW}/solana/info/logo.png`,
  chainLogoUrl: `${TW}/solana/info/logo.png`,
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
