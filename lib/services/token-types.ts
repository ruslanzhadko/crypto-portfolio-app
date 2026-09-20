export const MIN_TOKEN_USD = 0.1;

export interface NormalizedToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: number;
  usdValue: number;
  priceUsd: number;
  priceChange24h: number;
  logoUrl: string | null;
  isNative: boolean;
  chainName: string;
  isSpam: boolean;
  /** Provider-verified CoinGecko id. Never infer this from ticker alone. */
  coingeckoId?: string | null;
}

export interface NormalizedTransaction {
  hash: string;
  chainName: string;
  type: string;
  tokenSymbol: string | null;
  tokenName: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  value: number | null;
  sentValue?: number | null;
  usdValue: number | null;
  gasUsed: number | null;
  status: string;
  blockNumber: bigint | null;
  timestamp: Date;
}
