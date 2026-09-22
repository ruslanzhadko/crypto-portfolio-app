import { describe, expect, it } from 'vitest';
import { getTokenGroupingKey } from './token-grouping';

const token = (chainName: string, tokenAddress: string, tokenSymbol = 'WETH') => ({
  chainName, tokenAddress, tokenSymbol, coingeckoId: null,
});

describe('getTokenGroupingKey', () => {
  it('groups canonical WETH on supported chains', () => {
    const base = token('base', '0x4200000000000000000000000000000000000006');
    const arbitrum = token('arbitrum', '0x82AF49447D8A07E3BD95BD0D56F35241523FBAB1');
    const optimism = token('optimism', '0x4200000000000000000000000000000000000006');
    const ethereum = token('ethereum', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    expect(new Set([base, arbitrum, optimism, ethereum].map(getTokenGroupingKey)).size).toBe(1);
  });

  it('keeps other same-symbol contracts separate', () => {
    const canonical = token('base', '0x4200000000000000000000000000000000000006');
    const unrelated = token('base', '0x0000000000000000000000000000000000000001');
    expect(getTokenGroupingKey(canonical)).not.toBe(getTokenGroupingKey(unrelated));
    expect(getTokenGroupingKey(unrelated)).not.toBe(getTokenGroupingKey(token('arbitrum', unrelated.tokenAddress)));
  });

  it('keeps native ETH distinct from WETH while grouping it by market ID', () => {
    const eth = { ...token('base', '', 'ETH'), coingeckoId: 'ethereum' };
    expect(getTokenGroupingKey(eth)).toBe('market:ethereum');
    expect(getTokenGroupingKey(eth)).not.toBe(getTokenGroupingKey(token('base', '0x4200000000000000000000000000000000000006')));
  });
});
