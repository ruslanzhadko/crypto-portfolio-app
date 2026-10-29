import { describe, expect, it, vi } from 'vitest';
import { fetchTonBalances, fetchTonTransactionsPage, parsePercent, tonEventToTransaction } from './tonapi';

const RAW = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8';
const WALLET = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
const OTHER = '0:2db50958dd2078cb20f140886764e8b6e5475b985c4f3cf918cfcd17fdecd317';
const USDT = { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', symbol: 'USD₮', name: 'Tether USD', decimals: 6, image: 'https://usdt.png', verification: 'whitelist' };

function stub(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const path = Object.keys(routes).find((p) => url.includes(p));
    return { ok: !!path, status: path ? 200 : 404, json: async () => routes[path!] } as Response;
  }) as unknown as typeof fetch;
}

describe('TonAPI', () => {
  it('reads the Unicode minus in price changes', () => {
    expect(parsePercent('−2.20%')).toBe(-2.2);
    expect(parsePercent('+1.5%')).toBe(1.5);
    expect(parsePercent(undefined)).toBe(0);
  });

  it('returns Gram as the native coin and marks unverified jettons as spam', async () => {
    const tokens = await fetchTonBalances(WALLET, stub({
      '/jettons': {
        balances: [
          { balance: '2500000', price: { prices: { USD: 1 }, diff_24h: { USD: '+0.01%' } }, jetton: USDT },
          { balance: '2000000000', price: { prices: { USD: 0.09 } }, jetton: { ...USDT, address: OTHER, symbol: 'Prime', verification: 'none' } },
          { balance: '0', jetton: { ...USDT, symbol: 'Empty' } },
        ],
      },
      '/rates': { rates: { TON: { prices: { USD: 1.2 }, diff_24h: { USD: '−2.00%' } } } },
      '/accounts/': { balance: 3_000_000_000 },
    }));
    expect(tokens[0]).toMatchObject({ symbol: 'GRAM', isNative: true, balance: 3, priceUsd: 1.2, priceChange24h: -2, chainName: 'ton', coingeckoId: 'the-open-network' });
    expect(tokens[0]!.usdValue).toBeCloseTo(3.6, 9);
    expect(tokens[1]).toMatchObject({ symbol: 'USD₮', balance: 2.5, usdValue: 2.5, isSpam: false });
    expect(tokens[1]!.address.startsWith('EQ')).toBe(true);
    expect(tokens[2]).toMatchObject({ symbol: 'Prime', isSpam: true });
    expect(tokens).toHaveLength(3);
  });

  it('turns events into sends, receives and swaps from the wallet side', () => {
    const base = { timestamp: 1_793_000_000, lt: 5 };
    const received = tonEventToTransaction({
      ...base, event_id: 'a',
      actions: [{ type: 'TonTransfer', status: 'ok', TonTransfer: { sender: { address: OTHER }, recipient: { address: RAW }, amount: 1_500_000_000 } }],
    }, WALLET)!;
    expect(received).toMatchObject({ type: 'receive', tokenSymbol: 'GRAM', value: 1.5, toAddress: WALLET, hash: 'a', status: 'success' });

    const sent = tonEventToTransaction({
      ...base, event_id: 'b',
      actions: [{ type: 'JettonTransfer', status: 'ok', JettonTransfer: { sender: { address: RAW }, recipient: { address: OTHER }, amount: '10000000', jetton: USDT } }],
    }, WALLET)!;
    expect(sent).toMatchObject({ type: 'send', tokenSymbol: 'USD₮', value: 10 });

    const swap = tonEventToTransaction({
      ...base, event_id: 'c',
      actions: [{ type: 'JettonSwap', status: 'ok', JettonSwap: { ton_in: 2_000_000_000, amount_out: '2400000', jetton_master_out: USDT } }],
    }, WALLET)!;
    expect(swap).toMatchObject({ type: 'swap', swapOutSymbol: 'GRAM', swapInSymbol: 'USD₮', sentValue: 2, value: 2.4 });
  });

  it('pages history by logical time', async () => {
    const event = { event_id: 'x', timestamp: 1, actions: [{ type: 'TonTransfer', TonTransfer: { sender: { address: OTHER }, recipient: { address: RAW }, amount: 1 } }] };
    const fetchImpl = stub({ '/events': { events: [event, { ...event, event_id: 'y' }], next_from: 42 } });
    const page = await fetchTonTransactionsPage(WALLET, '99', 2, fetchImpl);
    expect(page.transactions.map((t) => t.hash)).toEqual(['x', 'y']);
    expect(page.nextPageToken).toBe('42');
    expect(String((fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0])).toContain('before_lt=99');
  });
});
