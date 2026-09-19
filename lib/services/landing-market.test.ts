import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLandingMarket, LANDING_COIN_IDS } from './landing-market';

afterEach(() => vi.unstubAllGlobals());
const rows = LANDING_COIN_IDS.map((id) => ({ id, symbol: id, name: id, image: null,
  current_price: 1, market_cap_rank: null, price_change_percentage_24h: null,
  last_updated: '2026-09-19T22:00:00.000Z' }));

describe('landing market', () => {
  it('requests Zcash instead of USDC and preserves the featured order', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [...rows].reverse() });
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchLandingMarket()).map((coin) => coin.id)).toEqual(LANDING_COIN_IDS);
    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.searchParams.get('ids')).toContain('zcash');
    expect(url.searchParams.get('ids')).not.toContain('usd-coin');
    expect(fetchMock.mock.calls[0]![1].next.revalidate).toBe(60);
  });
  it('reports upstream failure instead of returning made-up prices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchLandingMarket()).rejects.toThrow('Market data unavailable');
  });
  it('rejects incomplete lists rather than silently dropping ZEC', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => rows.slice(0, -1) }));
    await expect(fetchLandingMarket()).rejects.toThrow('Incomplete market response');
  });
});
