import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn((args: unknown) => ({ kind: 'upsert', args })),
  balanceUpdate: vi.fn((args: unknown) => ({ kind: 'balance', args })),
  transaction: vi.fn(async (writes: unknown[]) => writes),
  storedPrices: [] as Array<{ tokenId: string; currentPrice: number; priceChange24h: number; logoUrl: string | null }>,
  balances: [] as unknown[],
  feed: new Map<string, unknown>(),
  gate: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    wallet: { findMany: async () => [] },
    priceTrigger: { findMany: async () => [] },
    tokenBalance: {
      findMany: async (args: { distinct?: string[] }) =>
        args.distinct ? [{ coingeckoId: 'bitcoin' }, { coingeckoId: 'ethereum' }] : mocks.balances,
      update: mocks.balanceUpdate,
    },
    tokenPrice: {
      findMany: async () => mocks.storedPrices,
      upsert: mocks.upsert,
    },
    user: { findMany: async () => [] },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/services/coingecko', () => ({
  fetchPricesByIds: async () =>
    new Map([
      ['bitcoin', { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 107000, change24h: 1.5 }],
      ['ethereum', { id: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 3900, change24h: -0.5 }],
    ]),
}));
vi.mock('@/lib/services/price-feed', () => ({
  fetchPrices: async () => mocks.feed,
}));
vi.mock('@/lib/triggers/prices', () => ({ fetchGateTickers: mocks.gate }));
vi.mock('@/lib/services/wallet-sync', () => ({ syncWallet: vi.fn() }));
vi.mock('@/lib/services/portfolio', () => ({ savePortfolioSnapshot: vi.fn() }));
vi.mock('@/lib/services/telegram', () => ({
  sendPriceAlert: vi.fn(),
  sendPriceTargetAlert: vi.fn(),
  TelegramError: class extends Error {},
}));

import { runPriceUpdater } from './price-updater';

const balance = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  chainName: 'ethereum',
  tokenAddress: '',
  tokenSymbol: 'ETH',
  balance: 2,
  usdValue: 7800,
  priceUsd: 3900,
  priceChange24h: -0.5,
  coingeckoId: 'ethereum',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storedPrices = [];
  mocks.balances = [];
  mocks.feed = new Map([['ethereum::native', { price: 3900, change24h: -0.5, source: 'binance' }]]);
  mocks.gate.mockResolvedValue(new Map());
});

describe('runPriceUpdater writes', () => {
  it('writes only prices that changed, in one transaction', async () => {
    mocks.storedPrices = [
      { tokenId: 'bitcoin', currentPrice: 106000, priceChange24h: 1.2, logoUrl: null },
      { tokenId: 'ethereum', currentPrice: 3900, priceChange24h: -0.5, logoUrl: null },
    ];
    const result = await runPriceUpdater();
    expect(result.pricesUpdated).toBe(2);
    expect(result.pricesWritten).toBe(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({ where: { tokenId: 'bitcoin' } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it('skips balances whose value did not change and batches the rest', async () => {
    mocks.balances = [balance(), balance({ id: 'b2', balance: 1, usdValue: 3000, priceUsd: 3000 })];
    const result = await runPriceUpdater();
    expect(result.balancesRecalculated).toBe(1);
    expect(mocks.balanceUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.balanceUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'b2' } });
  });

  it('keeps the stored price of a coin without CoinGecko when Gate rejects the jump', async () => {
    mocks.feed = new Map([
      ['solana::cate', { price: 204.47, change24h: 0, source: 'dexscreener' }],
      ['solana::doom', { price: 0.03, change24h: 0, source: 'dexscreener' }],
    ]);
    mocks.gate.mockResolvedValue(new Map([['CATEUSDT', 0.04]]));
    const memecoin = { chainName: 'solana', coingeckoId: null, priceChange24h: 0 };
    mocks.balances = [
      balance({ ...memecoin, id: 'cate', tokenAddress: 'cate', tokenSymbol: 'CATE', balance: 1000, usdValue: 41, priceUsd: 0.041 }),
      balance({ ...memecoin, id: 'doom', tokenAddress: 'doom', tokenSymbol: 'DOOM', balance: 1000, usdValue: 25, priceUsd: 0.025 }),
    ];
    await runPriceUpdater();
    expect(mocks.balanceUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.balanceUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'doom' } });
  });
});
