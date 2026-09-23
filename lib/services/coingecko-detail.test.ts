import { describe, expect, it, vi } from 'vitest';
import { fetchCoinDetail } from './coingecko';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: () => ({ get: mocks.get }) } };
});

describe('CoinGecko coin detail', () => {
  it('uses the API all-time high rather than a rolling chart maximum', async () => {
    mocks.get.mockResolvedValueOnce({ data: {
      id: 'example', symbol: 'EX', name: 'Example',
      market_data: {
        current_price: { usd: 50 },
        ath: { usd: 200 },
        ath_change_percentage: { usd: -75 },
      },
    } });

    const detail = await fetchCoinDetail('example');

    expect(detail.ath).toBe(200);
    expect(detail.athChangePercent).toBe(-75);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('/coins/example', expect.any(Object));
  });
});
