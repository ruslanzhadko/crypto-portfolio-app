import { describe, expect, it } from 'vitest';
import { getTokenPageUrl } from './token-links';

describe('getTokenPageUrl', () => {
  it('prefers internal Market for an identified EVM contract', () => {
    expect(getTokenPageUrl({
      chainName: 'bsc', tokenAddress: '0xabc', coingeckoId: 'tether',
    })).toEqual({ href: '/market/tether', external: false });
  });

  it('uses internal Market for a known Solana mint', () => {
    expect(getTokenPageUrl({
      chainName: 'solana', tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      coingeckoId: 'usd-coin',
    })).toEqual({ href: '/market/usd-coin', external: false });
  });

  it('uses exact Solana mint instead of an ambiguous CoinGecko ticker match', () => {
    expect(getTokenPageUrl({
      chainName: 'solana', tokenAddress: 'DoomMint', coingeckoId: 'wrong-doom',
    })).toEqual({ href: 'https://dexscreener.com/solana/DoomMint', external: true });
  });

  it('supports EVM contracts on their exact DexScreener chain', () => {
    expect(getTokenPageUrl({
      chainName: 'bsc', tokenAddress: '0xabc', coingeckoId: null,
    })).toEqual({ href: 'https://dexscreener.com/bsc/0xabc', external: true });
  });

  it('keeps native assets on the internal market page', () => {
    expect(getTokenPageUrl({
      chainName: 'solana', tokenAddress: '', coingeckoId: 'solana',
    })).toEqual({ href: '/market/solana', external: false });
  });
});
