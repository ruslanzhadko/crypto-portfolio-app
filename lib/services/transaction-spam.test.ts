import { describe, expect, it } from 'vitest';
import { transactionIsSpam } from './transaction-spam';

const flagged = [{ chainName: 'bsc', tokenAddress: '0xAbC', isSpam: true }];

describe('transaction spam classification', () => {
  it('matches a flagged contract regardless of address casing', () => {
    expect(transactionIsSpam({ chainName: 'bsc', type: 'receive', tokenAddresses: ['0xabc'] }, flagged)).toBe(true);
  });

  it('does not confuse a different contract with the same symbol', () => {
    expect(transactionIsSpam({ chainName: 'bsc', type: 'receive', tokenAddresses: ['0xdef'], tokenSymbol: 'CATE' }, flagged)).toBe(true);
    expect(transactionIsSpam({ chainName: 'bsc', type: 'receive', tokenAddresses: ['0xdef'], tokenSymbol: 'CATE' }, [
      ...flagged, { chainName: 'bsc', tokenAddress: '0xdef', isSpam: false },
    ])).toBe(false);
  });

  it('does not hide the same contract address on another chain', () => {
    expect(transactionIsSpam({ chainName: 'base', type: 'receive', tokenAddresses: ['0xabc'] }, flagged)).toBe(true);
    expect(transactionIsSpam({ chainName: 'base', type: 'receive', tokenAddresses: ['0xabc'] }, [
      { chainName: 'base', tokenAddress: '0xabc', isSpam: false },
    ])).toBe(false);
  });

  it('keeps deliberate swaps even if an involved balance was marked as dust', () => {
    expect(transactionIsSpam({ chainName: 'bsc', type: 'swap', tokenAddresses: ['0xabc'] }, flagged)).toBe(false);
  });

  it('recognizes promotional links without labeling unknown tokens as spam', () => {
    expect(transactionIsSpam({ chainName: 'bsc', tokenSymbol: 'claim.example.com' }, [])).toBe(true);
    expect(transactionIsSpam({ chainName: 'bsc', tokenName: 'USDT Gift Voucher' }, [])).toBe(true);
    expect(transactionIsSpam({ chainName: 'robinhood', tokenSymbol: 'ODYSSEUS' }, [])).toBe(false);
  });

  it('hides unsolicited native dust but keeps meaningful and outgoing amounts', () => {
    expect(transactionIsSpam({ chainName: 'solana', type: 'receive', tokenSymbol: 'SOL', value: 0.000001 }, [])).toBe(true);
    expect(transactionIsSpam({ chainName: 'solana', type: 'receive', tokenSymbol: 'SOL', value: 0.01 }, [])).toBe(false);
    expect(transactionIsSpam({ chainName: 'solana', type: 'send', tokenSymbol: 'SOL', value: 0.000001 }, [])).toBe(false);
  });

  it('quarantines incoming unknown tokens of any amount, but keeps interacted contracts', () => {
    const tx = { chainName: 'bsc', type: 'receive', tokenAddresses: ['0xdef'], value: 2.29 };
    expect(transactionIsSpam(tx, flagged)).toBe(true);
    expect(transactionIsSpam(tx, [...flagged, { chainName: 'bsc', tokenAddress: '0xdef', isSpam: false }])).toBe(false);
    expect(transactionIsSpam(tx, flagged, new Set(['bsc:0xdef']))).toBe(false);
    expect(transactionIsSpam({ ...tx, type: 'send' }, flagged)).toBe(false);
  });

  it('quarantines forged outgoing Transfer events initiated by another address', () => {
    const tx = { chainName: 'bsc', type: 'send', tokenSymbol: 'U5DT', value: 100,
      tokenAddresses: ['0x1a81eccfcc8a25be3de130e16495c4b6d92a06bf'],
      walletAddress: '0xa96ce363034c99f137fa19cec7def645098f2787',
      transactionInitiator: '0x3843c61d6f8fc8b925e37f76df4fd94812745700' };
    expect(transactionIsSpam(tx, [])).toBe(true);
    expect(transactionIsSpam({ ...tx, tokenSymbol: 'USDT' }, [])).toBe(true);
    expect(transactionIsSpam(tx, [{ chainName: 'bsc', tokenAddress: tx.tokenAddresses[0]!, isSpam: true }])).toBe(true);
    expect(transactionIsSpam({ ...tx, transactionInitiator: tx.walletAddress.toUpperCase() }, [])).toBe(false);
    expect(transactionIsSpam({ ...tx, transactionInitiator: undefined }, [])).toBe(false);
  });

  it('keeps approved transfers of known real contracts even if another account submits them', () => {
    const tx = { chainName: 'bsc', type: 'send', tokenSymbol: 'USDT', value: 100,
      tokenAddresses: ['0x55d398326f99059ff775485246999027b3197955'],
      walletAddress: '0xwallet', transactionInitiator: '0xspender' };
    expect(transactionIsSpam(tx, [{ chainName: 'bsc', tokenAddress: tx.tokenAddresses[0]!, isSpam: false }])).toBe(false);
  });
});
