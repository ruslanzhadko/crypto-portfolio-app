import { fetchPricesByIds } from "@/lib/services/coingecko";
import { decimal } from "./decimal";

const IDS = [
  ["USDT", "tether"],
  ["USDC", "usd-coin"],
] as const;
/** Stablecoin quotes: every 30 minutes is plenty and keeps CoinGecko inside its monthly budget. */
const FRESH_MS = 30 * 60_000;
/** Stablecoin quotes barely move; a recent verified quote beats an unknown equity. */
const FALLBACK_MS = 6 * 3600_000;

let cached: { until: number; prices: Map<string, string> } | undefined;
let lastGood: { at: number; prices: Map<string, string> } | undefined;
let inflight: Promise<Map<string, string>> | undefined;

async function load(): Promise<Map<string, string>> {
  try {
    const result = await fetchPricesByIds(
      IDS.map(([, id]) => id),
      { attempts: 2, timeoutMs: 10_000 },
    );
    const prices = new Map<string, string>();
    for (const [symbol, id] of IDS) {
      const price = result.get(id)?.price;
      if (price && price > 0) prices.set(symbol, decimal(price)!);
    }
    if (prices.size === IDS.length) {
      cached = { until: Date.now() + FRESH_MS, prices };
      lastGood = { at: Date.now(), prices };
      return prices;
    }
  } catch {
    /* fall back below */
  }
  // A failed or partial quote (e.g. CoinGecko rate limit at a busy minute)
  // must not turn every exchange equity into "unknown" for the next minutes.
  if (lastGood && Date.now() - lastGood.at < FALLBACK_MS) {
    cached = { until: Date.now() + 60_000, prices: lastGood.prices };
    return lastGood.prices;
  }
  return new Map();
}

/** Explicit identity mapping: never a ticker search or an assumed stablecoin peg. */
export async function settlementPrices(): Promise<Map<string, string>> {
  if (cached && cached.until > Date.now()) return cached.prices;
  // Many connections sync in the same idle slot: share one request.
  inflight ??= load().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

/** Test hook. */
export function resetSettlementPrices() {
  cached = lastGood = inflight = undefined;
}
