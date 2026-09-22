import { describe, expect, it } from 'vitest';
import { transactionIsSpam } from './transaction-spam';

const flagged = [{ chainName: 'bsc', tokenAddress: '0xAbC', isSpam: true }];

describe('transaction spam classification', () => {
  it('matches a flagged contract regardless of address casing', () => {
    expect(transactionIsSpam({ chainName: 'bsc', type: 'receive', tokenAddresses: ['0xabc'] }, flagged)).toBe(true);
  });

  it('does not hide a different contract with the same symbol', () => {
    expect(transactionIsSpam({ chainName: 'bsc', type: 'receive', tokenAddresses: ['0xdef'], tokenSymbol: 'CATE' }, flagged)).toBe(false);
  });

  it('does not hide the same contract address on another chain', () => {
    expect(transactionIsSpam({ chainName: 'base', type: 'receive', tokenAddresses: ['0xabc'] }, flagged)).toBe(false);
  });

  it('keeps deliberate swaps even if an involved balance was marked as dust', () => {
    expect(transactionIsSpam({ chainName: 'bsc', type: 'swap', tokenAddresses: ['0xabc'] }, flagged)).toBe(false);
  });

  it('recognizes promotional links without labeling unknown tokens as spam', () => {
    expect(transactionIsSpam({ chainName: 'bsc', tokenSymbol: 'claim.example.com' }, [])).toBe(true);
    expect(transactionIsSpam({ chainName: 'robinhood', tokenSymbol: 'ODYSSEUS' }, [])).toBe(false);
  });

  it('quarantines a large incoming unknown-token airdrop but not a known token', () => {
    const tx = { chainName: 'bsc', type: 'receive', tokenAddresses: ['0xdef'], value: 2_000_000 };
    expect(transactionIsSpam(tx, flagged)).toBe(true);
    expect(transactionIsSpam(tx, [...flagged, { chainName: 'bsc', tokenAddress: '0xdef', isSpam: false }])).toBe(false);
    expect(transactionIsSpam({ ...tx, type: 'send' }, flagged)).toBe(false);
  });
});
