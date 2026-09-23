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
    expect(filterDashboardTokens([token], new Set(), '0xbase')).toEqual([token]);
  });

  it('recalculates balances for the selected network', () => {
    const [filtered] = filterDashboardTokens([token], new Set(['arbitrum']), 'weth');
    expect(filtered?.totalBalance).toBe(2);
    expect(filtered?.totalUsd).toBe(200);
    expect(filtered?.chains).toEqual(['arbitrum']);
    expect(filtered?.walletIds).toEqual(['two']);
    expect(filtered?.wallets[0]?.share).toBe(100);
    expect(filtered?.share).toBeCloseTo(66.67, 2);
  });

  it('combines only the selected networks without duplicating a token row', () => {
    const tokenAcrossThreeNetworks: AggregatedToken = {
      ...token,
      totalBalance: 7,
      totalUsd: 700,
      chains: ['base', 'arbitrum', 'optimism'],
      wallets: [
        ...token.wallets,
        { walletId: 'three', walletLabel: 'Third', walletAddress: '0x3', network: Network.EVM,
          chainName: 'optimism', balance: 4, usdValue: 400, share: 57.14 },
      ],
    };
    const results = filterDashboardTokens([tokenAcrossThreeNetworks], new Set(['base', 'arbitrum']), '');
    expect(results).toHaveLength(1);
    const [filtered] = results;
    expect(filtered?.totalBalance).toBe(3);
    expect(filtered?.totalUsd).toBe(300);
    expect(filtered?.chains).toEqual(['base', 'arbitrum']);
    expect(filtered?.wallets).toHaveLength(2);
    expect(filtered?.wallets.every((wallet) => wallet.chainName !== 'optimism')).toBe(true);
  });

  it('does not show a token on an unrelated network', () => {
    expect(filterDashboardTokens([token], new Set(['solana']), '')).toEqual([]);
  });
});
