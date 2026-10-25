import { describe, expect, it } from 'vitest';
import { pairRelayedSwaps } from './solana-relayed-swaps';

const ME = 'ELRvWallet';
const RELAY = 'BsDeRelay';
const handOver = {
  signature: 'handover', timestamp: 1000, nativeTransfers: [],
  tokenTransfers: [{ mint: 'PUMPmint', fromUserAccount: ME, toUserAccount: RELAY, tokenAmount: 13982.49 }],
};
const swap = {
  signature: 'swap', timestamp: 1004, nativeTransfers: [],
  tokenTransfers: [
    { mint: 'USDCmint', fromUserAccount: 'pool', toUserAccount: RELAY, tokenAmount: 49.747 },
    { mint: 'USDCmint', fromUserAccount: RELAY, toUserAccount: ME, tokenAmount: 49.747 },
    { mint: 'PUMPmint', fromUserAccount: RELAY, toUserAccount: 'pool', tokenAmount: 13982.49 },
  ],
};

describe('gasless swaps split into a hand-over and a swap', () => {
  it('folds the hand-over into the swap that spends it', () => {
    const { skip, handedOver } = pairRelayedSwaps([swap, handOver], ME);
    expect([...skip]).toEqual(['handover']);
    expect(handedOver.get('swap')).toEqual({ mint: 'PUMPmint', amount: 13982.49 });
  });

  it('keeps a plain send and a later unrelated receive apart', () => {
    const later = { ...swap, timestamp: 1000 + 3600 };
    const other = { ...swap, tokenTransfers: swap.tokenTransfers.filter((t) => t.mint !== 'PUMPmint') };
    expect(pairRelayedSwaps([later, handOver], ME).skip.size).toBe(0);
    expect(pairRelayedSwaps([other, handOver], ME).skip.size).toBe(0);
  });
});
