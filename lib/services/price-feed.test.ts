import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPrice, weightedMedianPrice } from './price-feed';

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
  it('prices a stablecoin from its own pools, not from a bigger pool quoted in it', async () => {
    const usdg = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
    mocks.get.mockResolvedValueOnce({ data: [
      { chainId: 'robinhood', baseToken: { address: usdg, symbol: 'USDG' }, quoteToken: { address: '0xweth', symbol: 'WETH' },
        priceUsd: '1.0007', priceNative: '0.00042', liquidity: { usd: 2_177_000 } },
      // A larger CRCL/USDG pool whose priceUsd and priceNative are momentarily out of step (inverted: ~3.18).
      { chainId: 'robinhood', baseToken: { address: '0xcrcl', symbol: 'CRCL' }, quoteToken: { address: usdg, symbol: 'USDG' },
        priceUsd: '272.7', priceNative: '85.75', liquidity: { usd: 2_815_000 } },
    ] });
    const price = await fetchPrice({ key: 'usdg-own-pools', isNative: false, chainName: 'robinhood', contractAddress: usdg });
    expect(price?.price).toBeCloseTo(1.0007, 4);
  });
});

describe('weightedMedianPrice', () => {
  it('ignores a single outlier pool', () => {
    const pool = (price: number, usd: number) => ({ price, pair: { liquidity: { usd } } });
    expect(weightedMedianPrice([pool(1.0, 900_000), pool(3.2, 400_000), pool(1.01, 600_000)])).toBe(1.01);
    expect(weightedMedianPrice([pool(2, 10_000)])).toBe(2);
  });
});
