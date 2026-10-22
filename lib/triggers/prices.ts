/**
 * Prices for price alerts. Coins traded against USDT on Binance are read from its public ticker
 * (no key, every few seconds); the rest come from CoinGecko, which has a monthly request budget,
 * so it is asked rarely. A CoinGecko ID is mapped to a Binance pair only when both prices agree.
 */
const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price";
/** Larger gaps mean the ticker is a different coin with the same symbol. */
const MAX_MAPPING_GAP = 0.03;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** USDT pairs from Binance's public ticker, keyed by pair (e.g. BTCUSDT). */
export async function fetchBinanceTickers(
  fetchImpl: FetchLike = fetch,
  timeoutMs = 10_000,
): Promise<Map<string, number>> {
  const res = await fetchImpl(BINANCE_TICKER_URL, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Binance ticker HTTP ${res.status}`);
  const body: unknown = await res.json();
  const result = new Map<string, number>();
  if (!Array.isArray(body)) return result;
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const { symbol, price } = row as { symbol?: unknown; price?: unknown };
    if (typeof symbol !== "string" || !symbol.endsWith("USDT")) continue;
    const value = Number(price);
    if (Number.isFinite(value) && value > 0) result.set(symbol, value);
  }
  return result;
}

/**
 * Maps CoinGecko IDs to Binance USDT pairs. A pair is trusted only when its price is within a few
 * percent of the CoinGecko price for that ID; otherwise the coin keeps using CoinGecko.
 */
export function mapToBinance(
  coins: { tokenId: string; symbol: string; price: number }[],
  tickers: Map<string, number>,
): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const coin of coins) {
    if (!(coin.price > 0)) continue;
    const pair = `${coin.symbol.toUpperCase()}USDT`;
    const ticker = tickers.get(pair);
    if (ticker && Math.abs(ticker / coin.price - 1) <= MAX_MAPPING_GAP)
      mapping.set(coin.tokenId, pair);
  }
  return mapping;
}

/** Current price per CoinGecko ID: Binance where mapped, the last CoinGecko price otherwise. */
export function combinePrices(
  tokenIds: string[],
  mapping: Map<string, string>,
  tickers: Map<string, number>,
  coingecko: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const tokenId of tokenIds) {
    const pair = mapping.get(tokenId);
    const price = (pair ? tickers.get(pair) : undefined) ?? coingecko.get(tokenId);
    if (price !== undefined && price > 0) result.set(tokenId, price);
  }
  return result;
}
