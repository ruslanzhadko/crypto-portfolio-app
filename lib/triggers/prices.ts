/**
 * Prices for price alerts. A coin traded against USDT on Binance follows Binance, otherwise Gate,
 * both public and free; the rest come from CoinGecko, which has a monthly request budget and is
 * asked rarely. A CoinGecko ID is mapped to an exchange pair only when both prices agree.
 * Full ticker lists are read once per window to build the mapping; every tick asks only for the
 * pairs in use.
 */
const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price";
const GATE_TICKER_URL = "https://api.gateio.ws/api/v4/spot/tickers";
/** Larger gaps mean the ticker is a different coin with the same symbol. */
const MAX_MAPPING_GAP = 0.03;

export type Venue = "binance" | "gate";
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs: number) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Ticker HTTP ${res.status}`);
  return res.json();
}

function collect(
  body: unknown,
  pairField: string,
  priceField: string,
  normalize: (pair: string) => string | null,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!Array.isArray(body)) return result;
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const pair = typeof record[pairField] === "string" ? normalize(record[pairField]) : null;
    const value = Number(record[priceField]);
    if (pair && Number.isFinite(value) && value > 0) result.set(pair, value);
  }
  return result;
}

/** Binance USDT pairs (BTCUSDT); all of them, or only `pairs` when given. */
export async function fetchBinanceTickers(
  fetchImpl: FetchLike = fetch,
  pairs?: string[],
  timeoutMs = 10_000,
): Promise<Map<string, number>> {
  if (pairs && !pairs.length) return new Map();
  const url = pairs
    ? `${BINANCE_TICKER_URL}?symbols=${encodeURIComponent(JSON.stringify(pairs))}`
    : BINANCE_TICKER_URL;
  return collect(await getJson(fetchImpl, url, timeoutMs), "symbol", "price", (pair) =>
    pair.endsWith("USDT") ? pair : null,
  );
}

/** Gate USDT pairs keyed the same way as Binance (BTC_USDT becomes BTCUSDT). */
export async function fetchGateTickers(
  fetchImpl: FetchLike = fetch,
  pairs?: string[],
  timeoutMs = 10_000,
): Promise<Map<string, number>> {
  const normalize = (pair: string) =>
    pair.endsWith("_USDT") ? pair.replace("_USDT", "USDT") : null;
  if (!pairs) return collect(await getJson(fetchImpl, GATE_TICKER_URL, timeoutMs), "currency_pair", "last", normalize);
  const result = new Map<string, number>();
  const rows = await Promise.all(
    pairs.map((pair) =>
      getJson(
        fetchImpl,
        `${GATE_TICKER_URL}?currency_pair=${encodeURIComponent(pair.replace(/USDT$/, "_USDT"))}`,
        timeoutMs,
      ).catch(() => []),
    ),
  );
  for (const body of rows)
    for (const [pair, price] of collect(body, "currency_pair", "last", normalize))
      result.set(pair, price);
  return result;
}

/**
 * Chooses where each coin's price comes from: Binance first, then Gate. A pair is trusted only
 * when its price is within a few percent of the CoinGecko price for that ID.
 */
export function mapToVenues(
  coins: { tokenId: string; symbol: string; price: number }[],
  binance: Map<string, number>,
  gate: Map<string, number>,
): Map<string, { venue: Venue; pair: string }> {
  const mapping = new Map<string, { venue: Venue; pair: string }>();
  for (const coin of coins) {
    if (!(coin.price > 0)) continue;
    const pair = `${coin.symbol.toUpperCase()}USDT`;
    for (const [venue, tickers] of [
      ["binance", binance],
      ["gate", gate],
    ] as const) {
      const ticker = tickers.get(pair);
      if (ticker && Math.abs(ticker / coin.price - 1) <= MAX_MAPPING_GAP) {
        mapping.set(coin.tokenId, { venue, pair });
        break;
      }
    }
  }
  return mapping;
}

/** Pairs to ask each exchange for on a tick. */
export function pairsByVenue(mapping: Map<string, { venue: Venue; pair: string }>) {
  const result: Record<Venue, string[]> = { binance: [], gate: [] };
  for (const { venue, pair } of mapping.values())
    if (!result[venue].includes(pair)) result[venue].push(pair);
  return result;
}

/** Current price per CoinGecko ID: the mapped exchange, else the last CoinGecko price. */
export function combinePrices(
  tokenIds: string[],
  mapping: Map<string, { venue: Venue; pair: string }>,
  tickers: Record<Venue, Map<string, number>>,
  coingecko: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const tokenId of tokenIds) {
    const source = mapping.get(tokenId);
    const price =
      (source ? tickers[source.venue].get(source.pair) : undefined) ?? coingecko.get(tokenId);
    if (price !== undefined && price > 0) result.set(tokenId, price);
  }
  return result;
}
