import { describe, it, expect } from 'vitest';
import { Network } from '@prisma/client';
import {
  getChainInfo,
  getChainColor,
  getChainDisplayName,
  getChainsByNetwork,
} from '@/lib/utils/networks';

describe('getChainInfo', () => {
  it('відомий ланцюг → ChainInfo', () => {
    const info = getChainInfo('ethereum');
    expect(info).not.toBeNull();
    expect(info!.symbol).toBe('ETH');
    expect(info!.network).toBe(Network.EVM);
  });
  it('solana → ChainInfo', () => {
    expect(getChainInfo('solana')!.symbol).toBe('SOL');
  });
  it('невідомий ланцюг → null', () => {
    expect(getChainInfo('fantom')).toBeNull();
  });
});

describe('getChainColor', () => {
  it('відомий ланцюг → його колір', () => {
    expect(getChainColor('bsc')).toBe('#f3ba2f');
  });
  it('невідомий ланцюг → дефолтний колір', () => {
    expect(getChainColor('unknown')).toBe('#6c63ff');
  });
});

describe('getChainDisplayName', () => {
  it('відомий ланцюг → людська назва', () => {
    expect(getChainDisplayName('polygon')).toBe('Polygon');
  });
  it('невідомий ланцюг → повертає вхід', () => {
    expect(getChainDisplayName('xyz')).toBe('xyz');
  });
});

describe('getChainsByNetwork', () => {
  it('EVM → 7 мереж', () => {
    expect(getChainsByNetwork(Network.EVM)).toHaveLength(7);
  });
  it('SOLANA → лише Solana', () => {
    const chains = getChainsByNetwork(Network.SOLANA);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.chainName).toBe('solana');
  });
});
