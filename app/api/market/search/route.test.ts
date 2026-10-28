import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const store = vi.hoisted(() => new Map<string, unknown>());
const search = vi.hoisted(() => vi.fn());
vi.mock('@vercel/functions', () => ({
  getCache: () => ({
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => void store.set(key, value),
  }),
}));
vi.mock('@/lib/api/auth-guard', () => ({ requireUser: async () => ({ ok: true, user: { id: 'u1' } }) }));
vi.mock('@/lib/services/coingecko', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/coingecko')>()),
  searchCoins: search,
}));
import { GET } from './route';

const request = (q: string) => new NextRequest(`https://app.example/api/market/search?q=${q}`);
const hype = [{ id: 'hyperliquid', symbol: 'HYPE', name: 'Hyperliquid', thumb: 'https://img/hype.png', marketCapRank: 12 }];

beforeEach(() => {
  store.clear();
  search.mockReset();
});

it('asks CoinGecko once per ticker and serves repeats from the shared cache', async () => {
  search.mockResolvedValue(hype);
  expect((await (await GET(request('HYPE'))).json()).results).toEqual(hype);
  expect((await (await GET(request('hype'))).json()).results).toEqual(hype);
  expect(search).toHaveBeenCalledTimes(1);
});

it('does not cache a failed lookup', async () => {
  search.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce(hype);
  expect((await GET(request('HYPE'))).status).toBe(500);
  expect((await (await GET(request('HYPE'))).json()).results).toEqual(hype);
  expect(search).toHaveBeenCalledTimes(2);
});
