import { fetchPricesByIds } from "@/lib/services/coingecko";
import { decimal } from "./decimal";
let cached: { until: number; prices: Map<string, string> } | undefined;
/** Explicit identity mapping: never a ticker search or an assumed stablecoin peg. */
export async function settlementPrices(): Promise<Map<string, string>> {
  if (cached && cached.until > Date.now()) return cached.prices;
  const result = await fetchPricesByIds(["tether", "usd-coin"], {
    attempts: 1,
    timeoutMs: 10_000,
  });
  const prices = new Map<string, string>();
  for (const [symbol, id] of [
    ["USDT", "tether"],
    ["USDC", "usd-coin"],
  ] as const) {
    const price = result.get(id)?.price;
    if (price && price > 0) prices.set(symbol, decimal(price)!);
  }
  cached = { until: Date.now() + 120_000, prices };
  return prices;
}
