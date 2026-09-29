import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchHyperCoreBalances, fetchHyperCoreTransactions, fetchHyperEvmBalances } from './hyperliquid';

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

beforeEach(() => { vi.clearAllMocks(); });

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
    get.mockImplementation(async (url) => ({ data: String(url).endsWith('/tokens')
      ? { items: [{ value: '2500000', token: { address_hash: user, symbol: 'USDC', name: 'USD Coin',
        decimals: '6', exchange_rate: '1', icon_url: null, type: 'ERC-20' } }], next_page_params: null }
      : { coin_balance: '1000000000000000000', exchange_rate: '25' } }) as never);
    const balances = await fetchHyperEvmBalances(user);
    expect(balances.map((b) => [b.chainName, b.symbol, b.balance])).toEqual([
      ['hyperevm', 'HYPE', 1], ['hyperevm', 'USDC', 2.5],
    ]);
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
