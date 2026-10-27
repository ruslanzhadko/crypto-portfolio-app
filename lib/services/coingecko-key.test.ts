import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { fetchPricesByIds, resetCoinGeckoKeyState } from './coingecko';

const mocks = vi.hoisted(() => ({ keyed: vi.fn(), keyless: vi.fn() }));
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const create = (config: { headers: Record<string, string> }) => ({
    get: config.headers['x-cg-demo-api-key'] ? mocks.keyed : mocks.keyless,
  });
  return { ...actual, default: { ...actual.default, create } };
});

const refused = (status: number) =>
  new AxiosError('refused', undefined, undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });
const tether = { data: [{ id: 'tether', symbol: 'usdt', name: 'Tether', current_price: 1 }] };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  resetCoinGeckoKeyState();
});

describe('CoinGecko Demo key out of credits', () => {
  it('repeats the request on the public API at once and stays there', async () => {
    vi.stubEnv('COINGECKO_API_KEY', 'demo-key');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.keyed.mockRejectedValue(refused(429));
    mocks.keyless.mockResolvedValue(tether);

    expect((await fetchPricesByIds(['tether'], { attempts: 1 })).get('tether')?.price).toBe(1);
    await fetchPricesByIds(['tether'], { attempts: 1 });
    expect(mocks.keyed).toHaveBeenCalledTimes(1);
    expect(mocks.keyless).toHaveBeenCalledTimes(2);
  });

  it('keeps using the key for other client errors', async () => {
    vi.stubEnv('COINGECKO_API_KEY', 'demo-key');
    mocks.keyed.mockRejectedValue(refused(404));
    await expect(fetchPricesByIds(['tether'], { attempts: 1 })).rejects.toThrow();
    expect(mocks.keyless).not.toHaveBeenCalled();
  });
});
