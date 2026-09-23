import { describe, expect, it } from 'vitest';
import { getTokenDetailReturn, getTokenPageUrl } from './token-links';

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

  it('links a Robinhood token by exact contract', () => {
    expect(getTokenPageUrl({
      chainName: 'robinhood',
      tokenAddress: '0x296293317f67da4f333968bb86928681e26b77fa',
      coingeckoId: null,
    })).toEqual({
      href: 'https://dexscreener.com/robinhood/0x296293317f67da4f333968bb86928681e26b77fa',
      external: true,
    });
  });

  it('keeps native assets on the internal market page', () => {
    expect(getTokenPageUrl({
      chainName: 'solana', tokenAddress: '', coingeckoId: 'solana',
    })).toEqual({ href: '/market/solana', external: false });
  });
});

describe('getTokenDetailReturn', () => {
  it('returns to the originating wallet or dashboard', () => {
    expect(getTokenDetailReturn('wallet:clwallet123')).toEqual({
      href: '/wallets/clwallet123', label: 'backToWallet',
    });
    expect(getTokenDetailReturn('dashboard')).toEqual({
      href: '/dashboard', label: 'backToDashboard',
    });
  });

  it('falls back to Market for direct or malformed links', () => {
    expect(getTokenDetailReturn(undefined).href).toBe('/market');
    expect(getTokenDetailReturn('wallet:../../admin').href).toBe('/market');
  });
});
