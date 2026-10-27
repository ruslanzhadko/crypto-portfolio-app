import { z } from 'zod';

export const LANDING_COIN_IDS = ['bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana', 'zcash'] as const;
const coinSchema = z.object({
  id: z.string(), symbol: z.string(), name: z.string(), image: z.string().nullable(),
  current_price: z.number().finite().nonnegative(),
  market_cap_rank: z.number().nullable(), price_change_percentage_24h: z.number().nullable(),
  last_updated: z.string().datetime(),
});
export type LandingCoin = z.infer<typeof coinSchema>;

export async function fetchLandingMarket(): Promise<LandingCoin[]> {
  const base = process.env.COINGECKO_BASE_URL?.replace(/\/$/, '') ?? 'https://api.coingecko.com/api/v3';
  const url = new URL(`${base}/coins/markets`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('ids', LANDING_COIN_IDS.join(','));
  url.searchParams.set('sparkline', 'false');
  const key = process.env.COINGECKO_API_KEY;
  const request = (withKey: boolean) =>
    fetch(url, {
      headers: { accept: 'application/json', ...(withKey && key ? { 'x-cg-demo-api-key': key } : {}) },
      next: { revalidate: 300 }, signal: AbortSignal.timeout(8000),
    });
  let response = await request(true);
  // A spent Demo key: the keyless public API has no monthly cap.
  if (key && [401, 403, 429].includes(response.status)) response = await request(false);
  if (!response.ok) throw new Error('Market data unavailable');
  const coins = z.array(coinSchema).parse(await response.json());
  return LANDING_COIN_IDS.map((id) => {
    const coin = coins.find((entry) => entry.id === id);
    if (!coin) throw new Error('Incomplete market response');
    return coin;
  });
}
