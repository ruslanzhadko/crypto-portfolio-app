import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchHyperCoreBalances, fetchHyperCoreTransactions, fetchHyperEvmBalances, fetchHyperEvmTransactions } from './hyperliquid';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
const post = vi.mocked(axios.post);
const get = vi.mocked(axios.get);
const user = '0x1111111111111111111111111111111111111111';
const tokenId = '0x6d1e7cde53ba9467b783cb7c530ce054';
const meta = [{ tokens: [
  { index: 0, name: 'USDC', fullName: null, tokenId, weiDecimals: 8 },
  { index: 150, name: 'HYPE', fullName: 'Hyperliquid', tokenId: '0x00000000000000000000000000000096', weiDecimals: 8 },
], universe: [{ index: 107, tokens: [150, 0] }] },
[{ markPx: '25', midPx: '25', prevDayPx: '20' }]];

beforeEach(() => { vi.clearAllMocks(); process.env.ETHERSCAN_API_KEY = 'test-key'; });

function mockEvm(native: string, transfers: unknown[]) {
  post.mockResolvedValue({ data: { result: native } } as never);
  get.mockResolvedValue({ data: { status: transfers.length ? '1' : '0',
    message: transfers.length ? 'OK' : 'No transactions found', result: transfers } } as never);
}

function mockCore(mode: string) {
  post.mockImplementation(async (_url, body) => {
    const type = (body as { type: string }).type;
    const value = type === 'spotClearinghouseState'
      ? { balances: [{ coin: 'USDC', token: 0, total: '100' }, { coin: 'HYPE', token: 150, total: '2' }] }
      : type === 'spotMetaAndAssetCtxs' ? meta
        : type === 'userAbstraction' ? mode
          : { marginSummary: { accountValue: '30' } };
    return { data: value } as never;
  });
}

describe('Hyperliquid balances', () => {
  it('uses only spot balances under unified account to avoid counting margin twice', async () => {
    mockCore('unifiedAccount');
    const balances = await fetchHyperCoreBalances(user);
    expect(balances.map((b) => [b.symbol, b.usdValue])).toEqual([['USDC', 100], ['HYPE', 50]]);
    expect(post).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'clearinghouseState' }), expect.anything());
  });
  it('adds separate perpetuals equity for standard accounts', async () => {
    mockCore('disabled');
    const balances = await fetchHyperCoreBalances(user);
    expect(balances.find((b) => b.chainName === 'hypercore-perps')).toMatchObject({ balance: 30, usdValue: 30 });
  });
  it('does not mistake HyperCore token IDs for HyperEVM contracts', async () => {
    mockCore('portfolioMargin');
    expect((await fetchHyperCoreBalances(user))[1]?.address).toBe('0x00000000000000000000000000000096');
  });
  it('reads native HYPE and ERC-20 balances from HyperEVM separately', async () => {
    const transfer = { hash: '0xabc', timeStamp: '1', from: user, to: user,
      contractAddress: user, value: '2500000', tokenName: 'USD Coin', tokenSymbol: 'USDC',
      tokenDecimal: '6', blockNumber: '1' };
    mockEvm('0xde0b6b3a7640000', [transfer]);
    post.mockImplementation(async (_url, body) => ({ data: {
      result: (body as { method: string }).method === 'eth_getBalance'
        ? '0xde0b6b3a7640000' : '0x2625a0',
    } }) as never);
    const balances = await fetchHyperEvmBalances(user);
    expect(balances.map((b) => [b.chainName, b.symbol, b.balance])).toEqual([
      ['hyperevm', 'HYPE', 1], ['hyperevm', 'USDC', 2.5],
    ]);
  });
  it('treats an address with no native balance or transfers as an empty wallet', async () => {
    mockEvm('0x0', []);
    expect(await fetchHyperEvmBalances(user)).toEqual([]);
  });
  it('requires an API key before replacing stored HyperEVM tokens', async () => {
    delete process.env.ETHERSCAN_API_KEY;
    post.mockResolvedValue({ data: { result: '0x0' } } as never);
    await expect(fetchHyperEvmBalances(user)).rejects.toThrow('ETHERSCAN_API_KEY');
  });
  it('reads HyperEVM transactions from Etherscan', async () => {
    get.mockImplementation(async (_url, config) => ({ data: { status: '1', message: 'OK', result:
      (config as { params: { action: string } }).params.action === 'txlist'
        ? [{ hash: '0xabc', timeStamp: '123', from: user, to: user, value: '1000000000000000000', blockNumber: '8', isError: '0' }]
        : [{ hash: '0xdef', timeStamp: '124', from: user, to: user, value: '2500000',
          contractAddress: user, tokenName: 'USD Coin', tokenSymbol: 'USDC', tokenDecimal: '6', blockNumber: '9' }],
    } }) as never);
    const result = await fetchHyperEvmTransactions(user);
    expect(result.transactions.map((tx) => [tx.tokenSymbol, tx.value])).toEqual([['USDC', 2.5], ['HYPE', 1]]);
  });
});

it('keeps separate IDs for multiple fills in a single HyperCore transaction', async () => {
  post.mockImplementation(async (_url, body) => ({ data: (body as { type: string }).type === 'userFills'
    ? [1, 2].map((tid) => ({ hash: `0x${'a'.repeat(64)}`, tid, coin: '@107', side: 'B', sz: '1', px: '25', time: 1000 }))
    : (body as { type: string }).type === 'spotMeta' ? meta[0] : [] }) as never);
  const txs = await fetchHyperCoreTransactions(user);
  expect(txs.map((tx) => tx.id)).toEqual([
    `0x${'a'.repeat(64)}:fill:1`, `0x${'a'.repeat(64)}:fill:2`,
  ]);
  expect(txs[0]?.tokenSymbol).toBe('HYPE/USDC');
});
