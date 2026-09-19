import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncWallet } from './wallet-sync';

const mocks = vi.hoisted(() => ({
  ankr: vi.fn(), robinhood: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(),
  findPrices: vi.fn(), count: vi.fn(),
}));
vi.mock('./ankr', () => ({ fetchEVMBalancesFromAnkr: mocks.ankr }));
vi.mock('./robinhood', () => ({ fetchRobinhoodBalances: mocks.robinhood }));
vi.mock('./coingecko', () => ({ fetchPricesByIds: vi.fn(), searchCoins: vi.fn() }));
vi.mock('./price-feed', () => ({ fetchPrices: vi.fn().mockResolvedValue(new Map()) }));
vi.mock('@/lib/db/prisma', () => {
  const db = {
    wallet: { findUnique: vi.fn().mockResolvedValue({ id: 'wallet', address: '0x123', network: 'EVM' }), update: vi.fn() },
    tokenBalance: { findMany: vi.fn().mockResolvedValue([]), count: mocks.count, deleteMany: mocks.deleteMany, createMany: mocks.createMany },
    tokenPrice: { findMany: mocks.findPrices, updateMany: vi.fn() },
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
const native = { symbol: 'ETH', name: 'Ethereum', address: '', decimals: 18, balance: 1,
  usdValue: 2000, priceUsd: 2000, priceChange24h: 1, logoUrl: '/eth.png',
  isNative: true, chainName: 'ethereum', isSpam: false };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ankr.mockResolvedValue([native]);
  mocks.robinhood.mockResolvedValue([{ ...native, chainName: 'robinhood' }]);
  mocks.findPrices.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
describe('Robinhood wallet synchronization', () => {
  it('persists Robinhood together with Ankr chains for the same wallet', async () => {
    const result = await syncWallet('wallet');
    expect(result.tokensSynced).toBe(2);
    expect(result.unavailableChains).toEqual([]);
    expect(mocks.createMany.mock.calls[0]?.[0].data.map((t: { chainName: string }) => t.chainName)).toEqual(['ethereum', 'robinhood']);
  });
  it('preserves stored Robinhood balances on upstream failure and reports partial sync', async () => {
    mocks.robinhood.mockRejectedValue(new Error('403'));
    const result = await syncWallet('wallet');
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { walletId: 'wallet', chainName: { not: 'robinhood' } } });
    expect(result.unavailableChains).toEqual(['robinhood']);
  });
  it('clears Robinhood balances after a successful empty response', async () => {
    mocks.ankr.mockResolvedValue([]);
    mocks.robinhood.mockResolvedValue([]);
    mocks.count.mockResolvedValue(1);
    await syncWallet('wallet');
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { walletId: 'wallet', chainName: 'robinhood' } });
  });
});
