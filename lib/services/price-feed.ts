import axios, { type AxiosInstance } from 'axios';

/**
 * Уніфікований pricing pipeline. Зменшує залежність від Moralis/CoinGecko CU,
 * використовуючи безкоштовні публічні джерела:
 *
 *  1. Binance — для нативних монет ланцюгів (ETH/BNB/POL/AVAX/SOL).
 *     Без auth, без лімітів у нашому масштабі.
 *  2. DexScreener — для ERC-20/SPL за contract address.
 *     Без auth, 300 req/min, до 30 адрес за один HTTP-виклик.
 *  3. CoinGecko — fallback для токенів з відомим coingeckoId,
 *     яких немає на DEX (вже окремо реалізовано у coingecko.ts).
 */

// ──────────────────────────────────────────────────────────────
// Типи
// ──────────────────────────────────────────────────────────────

export type PriceSource = 'binance' | 'dexscreener' | 'coingecko';

export interface PriceInfo {
  price: number;
  change24h: number;
  source: PriceSource;
  /** Логотип токена з DexScreener info.imageUrl — є не у всіх токенів */
  logoUrl?: string;
}

export interface PriceQuery {
  /** Унікальний у межах запиту ключ — повертається у Map<key, PriceInfo>. */
  key: string;
  isNative: boolean;
  /** Внутрішня назва ланцюга: ethereum, bsc, polygon, arbitrum, optimism, base, avalanche, solana. */
  chainName: string;
  /** Contract address — обов'язковий для не-нативних токенів. */
  contractAddress?: string;
}

// ──────────────────────────────────────────────────────────────
// Конфіг
// ──────────────────────────────────────────────────────────────

const BINANCE_BASE = 'https://api.binance.com';
const DEXSCREENER_BASE = 'https://api.dexscreener.com';
const REQUEST_TIMEOUT_MS = 8_000;
/**
 * Скільки запитів до DexScreener дозволяємо паралельно. Їх ліміт 300 req/min,
 * але при паралельності >10 починаються spurious 429. 8 — комфортний компроміс.
 */
const DEXSCREENER_CONCURRENCY = 8;
/**
 * Мінімум USD-ліквідності пари щоб вона була довіреним джерелом ціни.
 * Нижче — це часто scam-пари або проколи з маніпульованою ціною.
 */
const MIN_PAIR_LIQUIDITY_USD = 5_000;

/**
 * Мапа `chainName → Binance symbol` для нативних монет.
 * Для L2 (Arbitrum/Optimism/Base) нативна монета — ETH, тож ETHUSDT.
 */
const NATIVE_BINANCE_SYMBOL: Record<string, string> = {
  ethereum: 'ETHUSDT',
  arbitrum: 'ETHUSDT',
  optimism: 'ETHUSDT',
  base: 'ETHUSDT',
  bsc: 'BNBUSDT',
  polygon: 'POLUSDT',
  avalanche: 'AVAXUSDT',
  solana: 'SOLUSDT',
};

/**
 * Мапа `chainName → DexScreener chainId`. Збігається 1:1 у поточних мережах,
 * але виносимо в мапу — щоб майбутні розбіжності було легко правити.
 */
const DEXSCREENER_CHAIN_ID: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  avalanche: 'avalanche',
  solana: 'solana',
  xlayer: 'xlayer',
};

// ──────────────────────────────────────────────────────────────
// HTTP-клієнти (lazy)
// ──────────────────────────────────────────────────────────────

let binanceClient: AxiosInstance | null = null;
let dexClient: AxiosInstance | null = null;

function getBinance(): AxiosInstance {
  if (!binanceClient) {
    binanceClient = axios.create({
      baseURL: BINANCE_BASE,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { accept: 'application/json' },
    });
  }
  return binanceClient;
}

function getDexScreener(): AxiosInstance {
  if (!dexClient) {
    dexClient = axios.create({
      baseURL: DEXSCREENER_BASE,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { accept: 'application/json' },
    });
  }
  return dexClient;
}

// ──────────────────────────────────────────────────────────────
// Binance (нативні монети)
// ──────────────────────────────────────────────────────────────

interface Binance24hrResponse {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
}

async function fetchBinancePrice(symbol: string): Promise<PriceInfo | null> {
  try {
    const { data } = await getBinance().get<Binance24hrResponse>('/api/v3/ticker/24hr', {
      params: { symbol },
    });
    const price = Number.parseFloat(data.lastPrice);
    const change = Number.parseFloat(data.priceChangePercent);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      price,
      change24h: Number.isFinite(change) ? change : 0,
      source: 'binance',
    };
  } catch (err) {
    console.warn(`[price-feed] binance ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Запитує всі унікальні Binance-символи паралельно (зазвичай 1-5 штук). */
async function fetchBinancePrices(symbols: string[]): Promise<Map<string, PriceInfo>> {
  const result = new Map<string, PriceInfo>();
  if (symbols.length === 0) return result;
  const unique = Array.from(new Set(symbols));
  const responses = await Promise.allSettled(unique.map(fetchBinancePrice));
  for (let i = 0; i < unique.length; i++) {
    const r = responses[i];
    if (r?.status === 'fulfilled' && r.value) {
      result.set(unique[i]!, r.value);
    }
  }
  return result;
}

// ──────────────────────────────────────────────────────────────
// DexScreener (ERC-20 / SPL)
// ──────────────────────────────────────────────────────────────

interface DexPair {
  chainId: string;
  baseToken: { address: string; symbol?: string };
  quoteToken?: { address: string; symbol?: string };
  priceUsd?: string;
  priceNative?: string; // ціна base в одиницях quote (e.g. 1 ETH = 2137 USDC)
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  info?: { imageUrl?: string }; // логотип токена (є не у всіх пар)
}

/**
 * Запитує chain-specific endpoint DexScreener — `/token-pairs/v1/{chain}/{address}`.
 * Повертає до 30 пар саме на цьому ланцюгу (на відміну від `/latest/dex/tokens/`,
 * який змішує усі chains і обрізає до глобального топ-30).
 */
async function fetchDexScreenerToken(
  dexChainId: string,
  address: string,
): Promise<PriceInfo | null> {
  try {
    const { data } = await getDexScreener().get<DexPair[]>(
      `/token-pairs/v1/${dexChainId}/${address}`,
    );
    if (!Array.isArray(data) || data.length === 0) return null;

    // Фільтруємо за liquidity — щоб не зловити маніпулятивні/скам пари.
    const lowerAddr = address.toLowerCase();
    const liquid = data.filter(
      (p) => (p.liquidity?.usd ?? 0) >= MIN_PAIR_LIQUIDITY_USD,
    );
    if (liquid.length === 0) return null;

    // 1) Пари де queried token = base — `priceUsd` напряму є його USD-ціною.
    const baseCandidates = liquid.filter(
      (p) => p.baseToken.address.toLowerCase() === lowerAddr,
    );

    // 2) Пари де queried token = quote — отримуємо ціну інверсією
    //    (типовий випадок для USDC/USDT на L2: переважно WETH/USDC, не USDC/WETH).
    const quoteCandidates = liquid.filter(
      (p) =>
        p.baseToken.address.toLowerCase() !== lowerAddr &&
        p.quoteToken?.address.toLowerCase() === lowerAddr,
    );

    const candidates: Array<{ pair: DexPair; price: number }> = [];

    for (const p of baseCandidates) {
      const price = Number.parseFloat(p.priceUsd ?? '0');
      if (Number.isFinite(price) && price > 0) candidates.push({ pair: p, price });
    }
    for (const p of quoteCandidates) {
      const baseUsd = Number.parseFloat(p.priceUsd ?? '0');
      const baseInQuote = Number.parseFloat(p.priceNative ?? '0');
      if (
        Number.isFinite(baseUsd) && baseUsd > 0 &&
        Number.isFinite(baseInQuote) && baseInQuote > 0
      ) {
        // priceUsd / priceNative = USD-ціна quote-токена (1 USDC = $1 у пари ETH/USDC)
        candidates.push({ pair: p, price: baseUsd / baseInQuote });
      }
    }

    if (candidates.length === 0) return null;

    // Пара з найбільшою ліквідністю серед валідних
    const best = candidates.reduce(
      (a, b) => ((b.pair.liquidity?.usd ?? 0) > (a.pair.liquidity?.usd ?? 0) ? b : a),
      candidates[0]!,
    );

    // 24h change показуємо лише для base-пар — для quote-пар change стосується іншого токена
    const isBase = best.pair.baseToken.address.toLowerCase() === lowerAddr;
    const rawChange = isBase ? (best.pair.priceChange?.h24 ?? 0) : 0;
    // Ціна не може впасти більш ніж на 100%; значення поза [-99.9, 10000] — брудні дані
    const change = Number.isFinite(rawChange) ? Math.max(-99.9, Math.min(rawChange, 10_000)) : 0;

    // Збираємо imageUrl з усіх кандидатів — беремо перший непорожній
    const logoUrl =
      candidates.find((c) => c.pair.info?.imageUrl)?.pair.info?.imageUrl ?? undefined;

    return {
      price: best.price,
      change24h: change,
      source: 'dexscreener',
      ...(logoUrl ? { logoUrl } : {}),
    };
  } catch (err) {
    // 404 на неіснуючий контракт — нормально, не логуємо
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status !== 404) {
      console.warn(
        `[price-feed] dexscreener ${dexChainId}/${address}:`,
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}

/**
 * Опрацьовує масив завдань з обмеженою конкурентністю — щоб не задовбити DexScreener
 * (їх ліміт 300 req/min, але при >10 паралельних починаються 429).
 */
async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, next);
  await Promise.all(runners);
  return results;
}

// ──────────────────────────────────────────────────────────────
// Публічне API
// ──────────────────────────────────────────────────────────────

/**
 * Bulk-фетч цін для набору токенів. Сама обирає джерело:
 *  - native → Binance
 *  - ERC-20/SPL з contract address → DexScreener (батчами по 30)
 *  - токени без contract і не native → пропускаються (повертають null)
 *
 * Повертає Map<query.key, PriceInfo> — відсутні ключі = ціну не знайшли.
 */
export async function fetchPrices(
  queries: PriceQuery[],
): Promise<Map<string, PriceInfo>> {
  const result = new Map<string, PriceInfo>();
  if (queries.length === 0) return result;

  // 1) Розподіл запитів за джерелом
  const nativeQueries: Array<{ q: PriceQuery; symbol: string }> = [];
  const dexQueries: Array<{ q: PriceQuery; dexChainId: string; address: string }> = [];

  for (const q of queries) {
    if (q.isNative) {
      const symbol = NATIVE_BINANCE_SYMBOL[q.chainName];
      if (symbol) nativeQueries.push({ q, symbol });
      continue;
    }
    if (!q.contractAddress) continue;
    const dexChainId = DEXSCREENER_CHAIN_ID[q.chainName];
    if (!dexChainId) continue;
    dexQueries.push({ q, dexChainId, address: q.contractAddress });
  }

  // 2) Binance — паралельно по 5 нативним
  if (nativeQueries.length > 0) {
    const symbols = nativeQueries.map((x) => x.symbol);
    const binancePrices = await fetchBinancePrices(symbols);
    for (const { q, symbol } of nativeQueries) {
      const p = binancePrices.get(symbol);
      if (p) result.set(q.key, p);
    }
  }

  // 3) DexScreener — chain-specific endpoint per (chain, address)
  // Дедуплікуємо запити, бо один контракт може бути в багатьох гаманцях
  if (dexQueries.length > 0) {
    const uniqueByPair = new Map<string, { dexChainId: string; address: string }>();
    for (const x of dexQueries) {
      const pairKey = `${x.dexChainId}::${x.address.toLowerCase()}`;
      if (!uniqueByPair.has(pairKey)) {
        uniqueByPair.set(pairKey, { dexChainId: x.dexChainId, address: x.address });
      }
    }
    const uniquePairs = Array.from(uniqueByPair.entries());

    const responses = await runWithConcurrency(
      uniquePairs,
      async ([, { dexChainId, address }]) =>
        fetchDexScreenerToken(dexChainId, address),
      DEXSCREENER_CONCURRENCY,
    );

    const priceByPair = new Map<string, PriceInfo>();
    for (let i = 0; i < uniquePairs.length; i++) {
      const [pairKey] = uniquePairs[i]!;
      const p = responses[i];
      if (p) priceByPair.set(pairKey, p);
    }

    for (const { q, dexChainId, address } of dexQueries) {
      const pairKey = `${dexChainId}::${address.toLowerCase()}`;
      const p = priceByPair.get(pairKey);
      if (p) result.set(q.key, p);
    }
  }

  return result;
}

/** Зручний шорткат для одного токена. */
export async function fetchPrice(query: PriceQuery): Promise<PriceInfo | null> {
  const map = await fetchPrices([query]);
  return map.get(query.key) ?? null;
}
