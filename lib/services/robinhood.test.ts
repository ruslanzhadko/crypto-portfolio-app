import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchRobinhoodBalances, fetchRobinhoodTransactions, parseRobinhoodCursor } from './robinhood';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
const get = vi.mocked(axios.get);
const address = '0x1111111111111111111111111111111111111111';
const token = {
  address_hash: '0x2222222222222222222222222222222222222222',
  symbol: 'USDC', name: 'USD Coin', decimals: '6', exchange_rate: '1', icon_url: 'https://example.com/token.png', type: 'ERC-20',
};
const respond = (data: unknown) => get.mockResolvedValueOnce({ data });
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.stubEnv('ROBINHOOD_BLOCKSCOUT_API_KEY', ''); });

describe('Robinhood balances', () => {
  it('normalizes ETH and ERC-20, traverses pages and deduplicates contracts', async () => {
    respond({ coin_balance: '1500000000000000000', exchange_rate: '2000' });
    respond({ items: [{ token, value: '1234567' }], next_page_params: { items_count: 50 } });
    respond({ items: [{ token, value: '1234567' }], next_page_params: null });
    const balances = await fetchRobinhoodBalances(address);
    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({ chainName: 'robinhood', balance: 1.5, usdValue: 3000, isNative: true });
    expect(balances[1]).toMatchObject({ balance: 1.234567, priceUsd: 1, isNative: false });
    expect(get.mock.calls[2]?.[1]?.params).toEqual({ items_count: 50, type: 'ERC-20' });
  });
  it('returns an empty list for a confirmed empty account', async () => {
    respond({ coin_balance: '0', exchange_rate: null });
    respond({ items: [], next_page_params: null });
    expect(await fetchRobinhoodBalances(address)).toEqual([]);
  });
  it('does not turn a partial provider failure into a successful balance response', async () => {
    respond({ coin_balance: '1', exchange_rate: '2000' });
    respond({ items: [{ token, value: '10' }], next_page_params: { items_count: 50 } });
    get.mockRejectedValueOnce(new Error('Rate limited'));
    await expect(fetchRobinhoodBalances(address)).rejects.toThrow('Rate limited');
  });
  it('rejects unindexed balances and malformed amounts', async () => {
    respond({ coin_balance: null, exchange_rate: null });
    await expect(fetchRobinhoodBalances(address)).rejects.toThrow('not indexed');
    respond({ coin_balance: '-1', exchange_rate: null });
    await expect(fetchRobinhoodBalances(address)).rejects.toThrow('Invalid Robinhood');
  });
  it('uses the optional PRO key only on the trusted Blockscout endpoint', async () => {
    vi.stubEnv('ROBINHOOD_BLOCKSCOUT_API_KEY', 'test-key');
    respond({ coin_balance: '0', exchange_rate: null });
    respond({ items: [], next_page_params: null });
    await fetchRobinhoodBalances(address);
    expect(get.mock.calls[0]?.[0]).toBe(`https://api.blockscout.com/4663/api/v2/addresses/${address}`);
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ apikey: 'test-key' });
  });
});

describe('Robinhood transaction pagination', () => {
  it('combines the ETH sent and ERC-20 received in one swap row', async () => {
    respond({ items: [{
      hash: '0xswap', from: { hash: address }, to: { hash: token.address_hash },
      timestamp: '2026-09-19T00:00:00Z', block_number: 1,
      value: '10000000000000000', status: 'ok',
    }], next_page_params: null });
    respond({ items: [{
      transaction_hash: '0xswap', log_index: 1,
      from: { hash: token.address_hash }, to: { hash: address },
      timestamp: '2026-09-19T00:00:00Z', block_number: 1,
      token, total: { value: '1500000', decimals: '6' },
    }], next_page_params: null });
    respond({ items: [], next_page_params: null });
    const page = await fetchRobinhoodTransactions(address);
    expect(page.transactions).toHaveLength(1);
    expect(page.transactions[0]).toMatchObject({
      id: '0xswap:swap', type: 'swap', tokenSymbol: 'ETH → USDC',
      sentValue: 0.01, value: 1.5,
      swapOutTokenAddress: null, swapInTokenAddress: token.address_hash,
      logoUrl: null, swapLogoUrl: token.icon_url,
    });
  });
  it('keeps multiple transfer events in a transaction and resumes only unfinished streams', async () => {
    respond({ items: [], next_page_params: null });
    const event = {
      from: { hash: address }, to: { hash: token.address_hash }, timestamp: '2026-09-19T00:00:00Z',
      block_number: 1, transaction_hash: '0xabc', token, total: { decimals: '6', value: '1500000' },
    };
    respond({ items: [{ ...event, log_index: 1 }, { ...event, log_index: 2 }], next_page_params: { block_number: 1, index: 2 } });
    respond({ items: [], next_page_params: null });
    const page = await fetchRobinhoodTransactions(address);
    expect(page.transactions.map((tx) => tx.id)).toEqual(['0xabc:1', '0xabc:2']);
    expect(page.transactions[0]).toMatchObject({ type: 'send', value: 1.5 });
    expect(parseRobinhoodCursor(page.nextPageToken!).native).toBeNull();
    respond({ items: [], next_page_params: null });
    const last = await fetchRobinhoodTransactions(address, page.nextPageToken);
    expect(last.nextPageToken).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(4);
    expect(get.mock.calls[3]?.[0]).toContain('/token-transfers');
  });
  it.each([
    { symbol: 'CME', sent: ['69532686392571421981094'], payout: '16504473479954267', expectedSent: 69532.68639257142, expectedReceived: 0.016504473479954267 },
    { symbol: 'ROBIN', sent: ['18699381905295931166420', '15687123988959183152118'], payout: '63140292722145606', expectedSent: 34386.50589425511, expectedReceived: 0.0631402927221456 },
  ])('combines routed $symbol sales with internal ETH payouts', async ({ symbol, sent, payout, expectedSent, expectedReceived }) => {
    const common = { timestamp: '2026-09-26T10:12:41Z', block_number: 73002131 };
    respond({ items: [{ ...common, hash: '0xsale', value: '0', status: 'ok', from: { hash: address }, to: { hash: token.address_hash } }], next_page_params: null });
    respond({ items: sent.map((value, log_index) => ({
      ...common, transaction_hash: '0xsale', log_index,
      from: { hash: address }, to: { hash: token.address_hash },
      token: { ...token, symbol, decimals: '18' }, total: { value, decimals: '18' },
    })), next_page_params: null });
    const payoutEvent = {
      ...common, transaction_hash: '0xsale', index: 55, value: payout,
      from: { hash: token.address_hash }, to: { hash: address }, success: true, error: null, type: 'call',
    };
    respond({ items: [
      payoutEvent,
      { ...payoutEvent, index: 56, type: 'delegatecall' },
      { ...payoutEvent, index: 57, success: false, error: 'Parent reverted' },
      payoutEvent, // duplicate provider event must not increase the payout
    ], next_page_params: null });
    const page = await fetchRobinhoodTransactions(address);
    expect(page.transactions).toHaveLength(1);
    expect(page.transactions[0]).toMatchObject({ id: '0xsale:swap', type: 'swap', tokenSymbol: `${symbol} → ETH` });
    expect(page.transactions[0]).toMatchObject({ swapOutTokenAddress: token.address_hash, swapInTokenAddress: null, logoUrl: token.icon_url });
    expect(page.transactions[0]?.sentValue).toBeCloseTo(expectedSent, 8);
    expect(page.transactions[0]?.value).toBeCloseTo(expectedReceived, 12);
  });

  it('walks internal history pages to find an older sale payout', async () => {
    const common = { timestamp: '2026-09-23T13:02:00Z', block_number: 70533145 };
    respond({ items: [], next_page_params: null });
    respond({ items: [{ ...common, transaction_hash: '0xolder', log_index: 2,
      from: { hash: address }, to: { hash: token.address_hash }, token,
      total: { value: '1000000', decimals: '6' },
    }], next_page_params: null });
    const internal = { ...common, transaction_hash: '0xolder', index: 1,
      from: { hash: token.address_hash }, to: { hash: address },
      value: '10000000000000000', success: true, error: null, type: 'call' };
    respond({ items: [{ ...internal, timestamp: '2026-09-26T00:00:00Z', transaction_hash: '0xunrelated' }], next_page_params: { index: 50 } });
    respond({ items: [internal], next_page_params: null });
    const page = await fetchRobinhoodTransactions(address);
    expect(page.transactions[0]).toMatchObject({ type: 'swap', sentValue: 1, value: 0.01 });
    expect(get.mock.calls[3]?.[1]?.params).toEqual({ index: 50 });
  });

  it('does not duplicate a native root call or turn failed internal calls into swaps', async () => {
    const common = { timestamp: '2026-09-26T00:00:00Z', block_number: 1 };
    respond({ items: [{ ...common, hash: '0xsend', value: '10000000000000000', status: 'ok', from: { hash: address }, to: { hash: token.address_hash } }], next_page_params: null });
    respond({ items: [], next_page_params: null });
    respond({ items: [{ ...common, transaction_hash: '0xsend', index: 0, value: '10000000000000000', success: true, error: null, type: 'call', from: { hash: address }, to: { hash: token.address_hash } }], next_page_params: null });
    const page = await fetchRobinhoodTransactions(address);
    expect(page.transactions).toHaveLength(1);
    expect(page.transactions[0]).toMatchObject({ type: 'send', value: 0.01 });
  });

  it('reports internal history failures instead of presenting incomplete sales as sends', async () => {
    respond({ items: [{ hash: '0xcall', from: { hash: address }, to: { hash: token.address_hash }, timestamp: '2026-09-26T00:00:00Z', block_number: 1, value: '0', status: 'ok' }], next_page_params: null });
    respond({ items: [], next_page_params: null });
    get.mockRejectedValueOnce(new Error('Internal history unavailable'));
    await expect(fetchRobinhoodTransactions(address)).rejects.toThrow('Internal history unavailable');
  });
  it('rejects malformed cursors before making requests', async () => {
    await expect(fetchRobinhoodTransactions(address, 'invalid')).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});
