import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSolanaBalances, HeliusApiError, HeliusConfigError } from './helius';

const originalKey = process.env.HELIUS_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.HELIUS_API_KEY;
  else process.env.HELIUS_API_KEY = originalKey;
});

describe('fetchSolanaBalances', () => {
  it('normalizes native SOL and fungible token balances', async () => {
    process.env.HELIUS_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      result: {
        total: 1,
        nativeBalance: { lamports: 1_500_000_000, price_per_sol: 100, total_price: 150 },
        items: [{
          id: 'mint', interface: 'FungibleToken',
          content: { metadata: { name: 'USD Coin', symbol: 'USDC' }, links: { image: 'logo.png' } },
          token_info: { balance: 2_500_000, decimals: 6, price_info: { price_per_token: 1, total_price: 2.5 } },
        }],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSolanaBalances('wallet');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ symbol: 'SOL', balance: 1.5, priceUsd: 100, usdValue: 150 });
    expect(result[1]).toMatchObject({ symbol: 'USDC', address: 'mint', balance: 2.5, usdValue: 2.5 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api-key=test-key'), expect.any(Object));
  });

  it('does not turn provider failures into an empty wallet', async () => {
    process.env.HELIUS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(fetchSolanaBalances('wallet')).rejects.toEqual(expect.objectContaining({
      name: 'HeliusApiError', status: 429,
    } satisfies Partial<HeliusApiError>));
  });

  it('requires a configured API key', async () => {
    delete process.env.HELIUS_API_KEY;
    await expect(fetchSolanaBalances('wallet')).rejects.toBeInstanceOf(HeliusConfigError);
  });
});
