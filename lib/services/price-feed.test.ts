import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPrice } from './price-feed';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({
  default: { create: () => ({ get: mocks.get }) },
}));
beforeEach(() => mocks.get.mockReset());

describe('Robinhood contract pricing', () => {
  it('queries the exact chain and contract, accepting a liquid pair', async () => {
    const address = '0x296293317f67da4f333968bb86928681e26b77fa';
    mocks.get.mockResolvedValueOnce({ data: [{
      chainId: 'robinhood',
      baseToken: { address, symbol: 'ODYSSEUS' },
      quoteToken: { address: '0xeth', symbol: 'WETH' },
      priceUsd: '0.00003481',
      priceChange: { h24: 2.37 },
      liquidity: { usd: 18_000 },
    }] });

    const price = await fetchPrice({
      key: 'odysseus', isNative: false, chainName: 'robinhood', contractAddress: address,
    });

    expect(mocks.get).toHaveBeenCalledWith(`/token-pairs/v1/robinhood/${address}`);
    expect(price).toMatchObject({ price: 0.00003481, source: 'dexscreener' });
  });
  it('reuses a token price across wallets in the same cron run', async () => {
    const address = '0x1234567890123456789012345678901234567890';
    mocks.get.mockResolvedValue({ data: [{ chainId: 'hyperevm',
      baseToken: { address, symbol: 'TKN' }, priceUsd: '2', liquidity: { usd: 10000 },
    }] });
    const query = { key: 'shared', isNative: false, chainName: 'hyperevm', contractAddress: address };
    await fetchPrice(query);
    await fetchPrice(query);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
