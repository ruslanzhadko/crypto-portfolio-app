import { describe, expect, it } from 'vitest';
import { transactionAssets } from './transaction-assets';
import type { NormalizedTransaction } from './token-types';

const cme = '0xe2324ff2a59f8ecba8c321c6466e59121c00e795';
const tx: NormalizedTransaction = {
  hash: '0xhash', chainName: 'robinhood', type: 'swap', tokenSymbol: 'ETH → CME', tokenName: 'ETH → CME',
  tokenAddresses: [cme], swapOutTokenAddress: null, swapInTokenAddress: cme,
  fromAddress: '0xwallet', toAddress: '0xwallet', value: 67194.11, sentValue: 0.014,
  usdValue: null, gasUsed: null, status: 'success', blockNumber: 1n, timestamp: new Date(),
};
const balances = [{ chainName: 'robinhood', tokenAddress: cme, logoUrl: 'https://example.com/cme.png' }];

describe('transaction asset identities and logos', () => {
  it('attaches CME to the incoming side of ETH → CME instead of guessing by array index', () => {
    expect(transactionAssets(tx, balances)).toMatchObject({ swapInTokenAddress: cme, swapOutTokenAddress: null, swapLogoUrl: balances[0]!.logoUrl });
    expect(transactionAssets(tx, balances).logoUrl).not.toBe(balances[0]!.logoUrl);
  });
  it('keeps the same CME logo on the outgoing side of a sale', () => {
    expect(transactionAssets({ ...tx, tokenSymbol: 'CME → ETH', swapOutTokenAddress: cme, swapInTokenAddress: null }, balances)).toMatchObject({ logoUrl: balances[0]!.logoUrl, swapInTokenAddress: null });
  });
  it('uses provider metadata even when a sold token is absent from current balances', () => {
    expect(transactionAssets({ ...tx, swapLogoUrl: 'https://example.com/provider.png' }, []).swapLogoUrl).toBe('https://example.com/provider.png');
  });
  it('never borrows a logo from another contract or chain with the same ticker', () => {
    expect(transactionAssets(tx, [{ ...balances[0]!, tokenAddress: '0xother' }]).swapLogoUrl).toBeNull();
    expect(transactionAssets(tx, [{ ...balances[0]!, chainName: 'bsc' }]).swapLogoUrl).toBeNull();
  });
});
