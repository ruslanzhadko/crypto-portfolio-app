import { describe, expect, it } from 'vitest';
import { Network } from '@prisma/client';
import type { AggregatedToken } from '@/lib/services/portfolio';
import { filterDashboardTokens } from './dashboard-token-filter';

const token: AggregatedToken = {
  key: 'wrapped:ethereum', symbol: 'WETH', name: 'Wrapped Ether',
  logoUrl: null, coingeckoId: null, chainName: 'base', tokenAddress: '0xbase',
  totalBalance: 3, totalUsd: 300, share: 100, chains: ['base', 'arbitrum'],
  walletIds: ['one', 'two'], currentPrice: 100, priceChange24h: 2,
  wallets: [
    { walletId: 'one', walletLabel: 'Main', walletAddress: '0x1', network: Network.EVM,
      chainName: 'base', balance: 1, usdValue: 100, share: 33.33 },
    { walletId: 'two', walletLabel: 'Other', walletAddress: '0x2', network: Network.EVM,
      chainName: 'arbitrum', balance: 2, usdValue: 200, share: 66.67 },
  ],
};

describe('dashboard token filters', () => {
  it('keeps the original token for all networks and searches by contract', () => {
    expect(filterDashboardTokens([token], 'all', '0xbase')).toEqual([token]);
  });

  it('recalculates balances for the selected network', () => {
    const [filtered] = filterDashboardTokens([token], 'arbitrum', 'weth');
    expect(filtered?.totalBalance).toBe(2);
    expect(filtered?.totalUsd).toBe(200);
    expect(filtered?.chains).toEqual(['arbitrum']);
    expect(filtered?.walletIds).toEqual(['two']);
    expect(filtered?.wallets[0]?.share).toBe(100);
    expect(filtered?.share).toBeCloseTo(66.67, 2);
  });

  it('does not show a token on an unrelated network', () => {
    expect(filterDashboardTokens([token], 'solana', '')).toEqual([]);
  });
});
