import type { NormalizedToken } from './token-types';
import { COINGECKO_ID_BY_SOLANA_MINT } from '@/lib/utils/known-solana-tokens';

const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com/';
const PAGE_SIZE = 1000;
const FUNGIBLE_INTERFACES = new Set(['FungibleToken', 'FungibleAsset']);

interface HeliusAsset {
  id?: string;
  interface?: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
    files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>;
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    symbol?: string;
    price_info?: { price_per_token?: number; total_price?: number };
  };
}

interface HeliusAssetsResult {
  total?: number;
  items?: HeliusAsset[];
  nativeBalance?: {
    lamports?: number;
    price_per_sol?: number;
    total_price?: number;
  };
}

interface HeliusRpcResponse {
  result?: HeliusAssetsResult;
  error?: { code?: number; message?: string };
}

export class HeliusConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeliusConfigError';
  }
}

export class HeliusApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HeliusApiError';
    this.status = status;
  }
}

function finitePositive(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function assetLogo(asset: HeliusAsset): string | null {
  const image = asset.content?.files?.find((file) => file.mime?.startsWith('image/'));
  return image?.cdn_uri ?? image?.uri ?? asset.content?.links?.image ?? null;
}

async function getAssetsPage(
  address: string,
  apiKey: string,
  page: number,
): Promise<HeliusAssetsResult> {
  let response: Response;
  try {
    response = await fetch(`${HELIUS_RPC_BASE}?api-key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `wallet-sync-${page}`,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: address,
          page,
          limit: PAGE_SIZE,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
            showZeroBalance: false,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new HeliusApiError(error instanceof Error ? error.message : 'Helius request failed');
  }

  if (!response.ok) {
    throw new HeliusApiError(`HTTP ${response.status}`, response.status);
  }

  const payload = (await response.json()) as HeliusRpcResponse;
  if (payload.error || !payload.result) {
    throw new HeliusApiError(payload.error?.message ?? 'Helius returned an invalid response');
  }
  return payload.result;
}

/** Fetch native SOL and all non-zero SPL/Token-2022 balances via Helius DAS. */
export async function fetchSolanaBalances(address: string): Promise<NormalizedToken[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new HeliusConfigError('HELIUS_API_KEY не встановлено');

  const tokens: NormalizedToken[] = [];
  let page = 1;
  let fetched = 0;

  do {
    const result = await getAssetsPage(address, apiKey, page);
    const items = Array.isArray(result.items) ? result.items : [];

    if (page === 1) {
      const lamports = finitePositive(result.nativeBalance?.lamports);
      if (lamports > 0) {
        const balance = lamports / 1_000_000_000;
        const priceUsd = finitePositive(result.nativeBalance?.price_per_sol);
        tokens.push({
          symbol: 'SOL', name: 'Solana', address: '', decimals: 9, balance,
          usdValue: finitePositive(result.nativeBalance?.total_price) || balance * priceUsd,
          priceUsd, priceChange24h: 0, logoUrl: null, isNative: true,
          chainName: 'solana', isSpam: false,
        });
      }
    }

    for (const asset of items) {
      if (!FUNGIBLE_INTERFACES.has(asset.interface ?? '') || !asset.id) continue;
      const rawBalance = finitePositive(asset.token_info?.balance);
      const decimals = Math.max(0, asset.token_info?.decimals ?? 0);
      const balance = rawBalance / 10 ** decimals;
      if (!Number.isFinite(balance) || balance <= 0) continue;

      const symbol = (asset.content?.metadata?.symbol || asset.token_info?.symbol || '').trim();
      if (!symbol) continue;
      const priceUsd = finitePositive(asset.token_info?.price_info?.price_per_token);
      tokens.push({
        symbol,
        name: asset.content?.metadata?.name?.trim() || symbol,
        address: asset.id,
        decimals,
        balance,
        usdValue: finitePositive(asset.token_info?.price_info?.total_price) || balance * priceUsd,
        priceUsd,
        priceChange24h: 0,
        logoUrl: assetLogo(asset),
        isNative: false,
        chainName: 'solana',
        isSpam: false,
        coingeckoId: COINGECKO_ID_BY_SOLANA_MINT[asset.id] ?? null,
      });
    }

    fetched += items.length;
    if (items.length < PAGE_SIZE || fetched >= (result.total ?? fetched)) break;
    page += 1;
  } while (page <= 20);

  return tokens;
}
