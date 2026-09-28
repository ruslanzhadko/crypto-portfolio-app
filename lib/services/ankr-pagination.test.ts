import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchTransactionsPage } from './ankr';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});
const post = vi.mocked(axios.post);
const wallet = '0xwallet';
const transfers = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => ({
  blockchain: 'bsc', transactionHash: `0x${index + offset}`,
  fromAddress: wallet, toAddress: '0xrecipient', value: '100',
  valueRawInteger: '100000000000000000000', tokenDecimals: 18,
  tokenName: 'Tether USD', tokenSymbol: 'USDT', timestamp: 1790542420 - index - offset,
}));
beforeEach(() => vi.clearAllMocks());

describe('Ankr provider-page preservation', () => {
  it('keeps every classified row before advancing to the next provider cursor', async () => {
    post.mockResolvedValueOnce({ data: { result: { transfers: transfers(65), nextPageToken: 'next' } } });
    post.mockResolvedValueOnce({ data: { result: { transactions: [] } } });
    const first = await fetchTransactionsPage(wallet, undefined, 20);
    expect(first.transactions).toHaveLength(65);
    expect(first.nextPageToken).toBe('next');
    post.mockResolvedValueOnce({ data: { result: { transfers: transfers(10, 65), nextPageToken: '' } } });
    const second = await fetchTransactionsPage(wallet, first.nextPageToken, 20);
    const all = [...first.transactions, ...second.transactions];
    expect(new Set(all.map((tx) => tx.hash)).size).toBe(75);
    expect(second.nextPageToken).toBeUndefined();
    expect(post.mock.calls[2]?.[1]).toMatchObject({ params: { pageToken: 'next' } });
  });

  it('does not discard the remainder of the final page with no provider cursor', async () => {
    post.mockResolvedValueOnce({ data: { result: { transfers: transfers(30), nextPageToken: '' } } });
    post.mockResolvedValueOnce({ data: { result: { transactions: [] } } });
    const page = await fetchTransactionsPage(wallet, undefined, 20);
    expect(page.transactions).toHaveLength(30);
    expect(page.nextPageToken).toBeUndefined();
  });
});
