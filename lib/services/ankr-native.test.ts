import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchTransactionsPage } from './ankr';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, post: vi.fn(), get: vi.fn() } };
});
const post = vi.mocked(axios.post);
const get = vi.mocked(axios.get);
const wallet = '0xwallet';

const send = (hash: string, blockchain: string, tokenSymbol: string, index: number) => ({
  blockchain, transactionHash: hash, fromAddress: wallet, toAddress: '0xrouter', value: '100',
  valueRawInteger: '100000000000000000000', tokenDecimals: 18, tokenName: tokenSymbol, tokenSymbol,
  contractAddress: `0x${tokenSymbol.toLowerCase()}`, timestamp: 1790542420 - index,
});

/** A page: many stablecoin sends on BSC, one token sale on BSC and the ZC sale on Ethereum. */
function page(zc: string, bscSale: string) {
  post.mockResolvedValueOnce({
    data: {
      result: {
        transfers: [
          ...Array.from({ length: 15 }, (_, i) => send(`0xusdt${zc}${i}`, 'bsc', 'USDT', i)),
          send(bscSale, 'bsc', 'CAKE', 20),
          send(zc, 'eth', 'ZC', 30),
        ],
        nextPageToken: '',
      },
    },
  });
  post.mockResolvedValueOnce({ data: { result: { transactions: [] } } });
}
const etherscan = (result: unknown, status = '1') => ({ data: { status, result } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('Etherscan internal ETH for token sales', () => {
  it('never caches an Etherscan error as "no ETH", skips stablecoins and refused chains', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'test-key');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockImplementation(async (_url, config) => {
      const { chainid, txhash } = (config as { params: { chainid: number; txhash: string } }).params;
      if (chainid === 56) return etherscan('Free API access is not supported for this chain', '0');
      if (txhash === '0xzc1') return etherscan('Max rate limit reached', '0');
      return etherscan([]);
    });
    page('0xzc1', '0xcake1');
    const first = await fetchTransactionsPage(wallet, undefined, 20);
    expect(first.transactions.find((tx) => tx.hash === '0xzc1')?.type).toBe('send');
    // Stablecoin sends are never looked up.
    const hashes = () => get.mock.calls.map(([, config]) => (config as { params: { txhash: string } }).params.txhash);
    expect(hashes().some((hash) => hash.startsWith('0xusdt'))).toBe(false);

    // Next view: the rate limit has passed and the ETH the router paid out is found.
    get.mockClear();
    get.mockImplementation(async () =>
      etherscan([{ to: wallet, value: '17213961302280884', isError: '0' }]),
    );
    page('0xzc1', '0xcake2');
    const second = await fetchTransactionsPage(wallet, undefined, 20);
    expect(second.transactions.find((tx) => tx.hash === '0xzc1')).toMatchObject({
      type: 'swap',
      tokenSymbol: 'ZC → ETH',
    });
    // BSC refused the key once and is not asked again.
    expect(hashes()).toEqual(['0xzc1']);
  });
});
