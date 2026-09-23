import axios, { AxiosError, type AxiosInstance } from 'axios';

let client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (client) return client;
  const baseURL =
    process.env.COINGECKO_BASE_URL?.replace(/\/$/, '') ??
    'https://api.coingecko.com/api/v3';
  const apiKey = process.env.COINGECKO_API_KEY;
  client = axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      accept: 'application/json',
      ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}),
    },
  });
  return client;
}

export class CoinGeckoError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CoinGeckoError';
    this.status = status;
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status =
        err instanceof AxiosError ? err.response?.status : undefined;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw new CoinGeckoError(err instanceof Error ? err.message : 'Помилка', status);
      }
      if (i < attempts - 1) {
        const delay = 2000 * 2 ** i;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new CoinGeckoError(
    lastErr instanceof Error ? lastErr.message : 'CoinGecko не відповідає',
    lastErr instanceof AxiosError ? lastErr.response?.status : undefined,
  );
}

// ─────────────────────────────────────────
// Типи
// ─────────────────────────────────────────

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price: number[] } | null;
}

export interface SimplePriceItem {
  id: string;
  symbol?: string;
  name?: string;
  price: number;
  change24h: number;
  marketCap?: number | null;
  volume24h?: number | null;
  image?: string | null;
}

export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  description: string;
  image: string | null;
  marketCap: number | null;
  volume24h: number | null;
  currentPrice: number;
  priceChange1h: number;
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;
  high24h: number | null;
  low24h: number | null;
  ath: number | null;
  athChangePercent: number | null;
  rank: number | null;
  homepage: string | null;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string | null;
  marketCapRank: number | null;
}

const CONTRACT_PLATFORM_BY_CHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  base: 'base',
  avalanche: 'avalanche',
  xlayer: 'x-layer',
};

interface CoinWithPlatforms {
  id: string;
  platforms?: Record<string, string | null>;
}

let contractIdCache: Map<string, string> | null = null;
let contractIdCacheUntil = 0;
let contractIdLoad: Promise<Map<string, string>> | null = null;

/** Resolves market identity by exact chain and contract, never by symbol. */
export async function fetchCoinGeckoContractIds(): Promise<Map<string, string>> {
  if (contractIdCache && Date.now() < contractIdCacheUntil) return contractIdCache;
  if (contractIdLoad) return contractIdLoad;

  contractIdLoad = (async () => {
    const { data } = await withRetry(() => getClient().get<CoinWithPlatforms[]>(
      '/coins/list', { params: { include_platform: true }, timeout: 30_000 },
    ), 1);
    if (!Array.isArray(data)) throw new CoinGeckoError('Некоректний список контрактів CoinGecko');

    const ids = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const coin of data) {
      if (!coin.id || !coin.platforms) continue;
      for (const [chain, platform] of Object.entries(CONTRACT_PLATFORM_BY_CHAIN)) {
        const address = coin.platforms[platform]?.toLowerCase();
        if (!address) continue;
        const key = `${chain}:${address}`;
        const previous = ids.get(key);
        if (previous && previous !== coin.id) ambiguous.add(key);
        else ids.set(key, coin.id);
      }
    }
    for (const key of ambiguous) ids.delete(key);
    contractIdCache = ids;
    contractIdCacheUntil = Date.now() + 24 * 60 * 60 * 1000;
    return ids;
  })();
  try {
    return await contractIdLoad;
  } finally {
    contractIdLoad = null;
  }
}

// ─────────────────────────────────────────
// API
// ─────────────────────────────────────────

export async function fetchTopMarkets(opts: {
  page?: number;
  perPage?: number;
  sparkline?: boolean;
} = {}): Promise<MarketCoin[]> {
  const { page = 1, perPage = 100, sparkline = false } = opts;
  const { data } = await withRetry(() =>
    getClient().get<MarketCoin[]>('/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: perPage,
        page,
        sparkline,
        price_change_percentage: '24h,7d',
      },
    }),
  );
  return Array.isArray(data) ? data : [];
}

export interface FetchPricesOptions {
  /** Кількість спроб у withRetry (дефолт 3). */
  attempts?: number;
  /** Таймаут одного HTTP-запиту, мс (перекриває дефолтні 15с клієнта). */
  timeoutMs?: number;
}

export async function fetchPricesByIds(
  ids: string[],
  opts: FetchPricesOptions = {},
): Promise<Map<string, SimplePriceItem>> {
  if (ids.length === 0) return new Map();

  const { attempts = 3, timeoutMs } = opts;
  const result = new Map<string, SimplePriceItem>();

  // Batch by 250 per request (CoinGecko limit for /coins/markets)
  for (let i = 0; i < ids.length; i += 250) {
    const batch = ids.slice(i, i + 250);
    const { data } = await withRetry(
      () =>
        getClient().get<MarketCoin[]>('/coins/markets', {
          params: {
            vs_currency: 'usd',
            ids: batch.join(','),
            per_page: batch.length,
            page: 1,
            sparkline: false,
            price_change_percentage: '24h',
          },
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
        }),
      attempts,
    );
    for (const coin of data ?? []) {
      result.set(coin.id, {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        price: coin.current_price ?? 0,
        change24h: coin.price_change_percentage_24h ?? 0,
        marketCap: coin.market_cap,
        volume24h: coin.total_volume,
        image: coin.image,
      });
    }
  }

  return result;
}

interface CoinGeckoSearchResponse {
  coins?: Array<{
    id: string;
    symbol: string;
    name: string;
    thumb: string | null;
    market_cap_rank: number | null;
  }>;
}

export async function searchCoins(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const { data } = await withRetry(() =>
    getClient().get<CoinGeckoSearchResponse>('/search', {
      params: { query: query.trim() },
    }),
  );
  return (data.coins ?? []).slice(0, 20).map((c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    thumb: c.thumb,
    marketCapRank: c.market_cap_rank,
  }));
}

interface CoinGeckoDetailResponse {
  id: string;
  symbol: string;
  name: string;
  description?: { en?: string };
  image?: { large?: string; small?: string };
  links?: { homepage?: string[] };
  market_cap_rank?: number;
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    high_24h?: { usd?: number };
    low_24h?: { usd?: number };
    ath?: { usd?: number };
    ath_change_percentage?: { usd?: number };
    price_change_percentage_1h_in_currency?: { usd?: number };
    price_change_percentage_24h?: number;
    price_change_percentage_7d?: number;
    price_change_percentage_30d?: number;
  };
}

export async function fetchCoinDetail(id: string): Promise<CoinDetail> {
  const { data } = await withRetry(() =>
    getClient().get<CoinGeckoDetailResponse>(`/coins/${id}`, {
      params: {
        localization: false,
        tickers: false,
        community_data: false,
        developer_data: false,
        sparkline: false,
      },
    }),
  );
  const md = data.market_data;
  const homepage = data.links?.homepage?.find((u) => u && u.length > 0) ?? null;
  const currentPrice = md?.current_price?.usd ?? 0;
  const apiAth = md?.ath?.usd;
  const ath = apiAth !== undefined && Number.isFinite(apiAth) && apiAth > 0 ? apiAth : null;
  const apiAthChange = md?.ath_change_percentage?.usd;
  const athChangePercent = ath !== null && apiAthChange !== undefined && Number.isFinite(apiAthChange)
    ? apiAthChange
    : null;
  return {
    id: data.id,
    symbol: data.symbol,
    name: data.name,
    description: data.description?.en?.split('. ')[0] ?? '',
    image: data.image?.large ?? data.image?.small ?? null,
    rank: data.market_cap_rank ?? null,
    homepage,
    currentPrice,
    marketCap: md?.market_cap?.usd ?? null,
    volume24h: md?.total_volume?.usd ?? null,
    high24h: md?.high_24h?.usd ?? null,
    low24h: md?.low_24h?.usd ?? null,
    ath,
    athChangePercent,
    priceChange1h: md?.price_change_percentage_1h_in_currency?.usd ?? 0,
    priceChange24h: md?.price_change_percentage_24h ?? 0,
    priceChange7d: md?.price_change_percentage_7d ?? 0,
    priceChange30d: md?.price_change_percentage_30d ?? 0,
  };
}

interface MarketChartResponse {
  prices?: Array<[number, number]>;
}

export async function fetchMarketChart(
  id: string,
  days: number,
): Promise<PricePoint[]> {
  const { data } = await withRetry(() =>
    getClient().get<MarketChartResponse>(`/coins/${id}/market_chart`, {
      params: { vs_currency: 'usd', days, interval: days > 90 ? 'daily' : undefined },
    }),
  );
  return (data.prices ?? []).map(([timestamp, price]) => ({ timestamp, price }));
}
