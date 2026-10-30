/**
 * Guards coins without a CoinGecko reference against a false price from the pools. A misreported
 * pool once priced CATE at $204 instead of $0.04 for 1.5 hours and added $282k to a wallet's history.
 * A sharp move is checked against the coin's Gate ticker; it is dropped when Gate still shows the old price.
 */
import { fetchGateTickers } from '@/lib/triggers/prices';

/** A move this many times up or down in one update needs a second opinion. */
const JUMP_RATIO = 3;
/** A ticker further than this from both prices is another coin with the same symbol: no opinion. */
const SAME_PRICE_GAP = 0.3;

export interface PriceMove {
  symbol: string;
  previous: number;
  next: number;
}

const isJump = ({ previous, next }: PriceMove) =>
  previous > 0 && next > 0 && (next / previous >= JUMP_RATIO || previous / next >= JUMP_RATIO);

const near = (a: number, b: number) => Math.abs(a / b - 1) <= SAME_PRICE_GAP;

const pairOf = (symbol: string) => {
  const ticker = symbol.toUpperCase();
  return /^[A-Z0-9]{1,20}$/.test(ticker) ? `${ticker}USDT` : null;
};

/** The moves to drop: Gate shows the old price, not the new one. Without a usable ticker a move stands. */
export async function falsePriceJumps<T extends PriceMove>(
  moves: T[],
  fetchTickers: (pairs: string[]) => Promise<Map<string, number>> = (pairs) => fetchGateTickers(fetch, pairs),
): Promise<Set<T>> {
  const jumps = moves.filter(isJump);
  const pairs = [...new Set(jumps.flatMap((m) => pairOf(m.symbol) ?? []))];
  const rejected = new Set<T>();
  if (pairs.length === 0) return rejected;
  const tickers = await fetchTickers(pairs).catch(() => new Map<string, number>());
  for (const move of jumps) {
    const pair = pairOf(move.symbol);
    const ticker = pair ? tickers.get(pair) : undefined;
    if (ticker && near(ticker, move.previous) && !near(ticker, move.next)) {
      console.warn(`[price-jump] ${move.symbol}: kept ${move.previous}, pools said ${move.next}, Gate ${ticker}`);
      rejected.add(move);
    }
  }
  return rejected;
}
