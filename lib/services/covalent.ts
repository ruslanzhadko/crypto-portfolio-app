import axios, { AxiosError } from 'axios';
import { Network } from '@prisma/client';
import { EVM_CHAINS } from '@/lib/utils/networks';

// Covalent chain IDs для наших підтримуваних мереж
const COVALENT_CHAIN_ID: Record<string, string | number> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  avalanche: 43114,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  solana: 'solana-mainnet',
};

export interface DailyPortfolioPoint {
  timestamp: number; // ms
  totalUsd: number;
}

function getClient() {
  const key = process.env.COVALENT_API_KEY;
  if (!key) throw new Error('COVALENT_API_KEY не вказано');
  return axios.create({
    baseURL: 'https://api.covalenthq.com/v1',
    timeout: 20_000,
    auth: { username: key, password: '' },
    headers: { accept: 'application/json' },
  });
}

interface CovalentHolding {
  timestamp: string; // ISO "2024-01-15T00:00:00Z"
  close: { quote: number | null };
}

interface CovalentItem {
  holdings: CovalentHolding[];
}

interface CovalentResponse {
  data: { items: CovalentItem[] } | null;
  error: boolean;
}

// Повертає Map<dateKey "YYYY-MM-DD", totalUsd> для однієї мережі
async function fetchChainDailyTotals(
  address: string,
  chainId: string | number,
): Promise<Map<string, number>> {
  try {
    const { data } = await getClient().get<CovalentResponse>(
      `/${chainId}/address/${address}/portfolio_v2/`,
    );
    if (data.error || !data.data?.items?.length) return new Map();

    const dailyTotals = new Map<string, number>();
    for (const item of data.data.items) {
      for (const h of item.holdings) {
        const usd = h.close?.quote ?? 0;
        if (usd <= 0) continue;
        const dateKey = h.timestamp.slice(0, 10);
        dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + usd);
      }
    }
    return dailyTotals;
  } catch (err) {
    const status = err instanceof AxiosError ? err.response?.status : undefined;
    if (status !== 404 && status !== 422) {
      console.warn(`[Covalent] chain=${chainId} помилка:`, status ?? err);
    }
    return new Map();
  }
}

/**
 * Отримує 30-денну денну USD-вартість портфеля з Covalent.
 * Для EVM — агрегує по всіх підтримуваних ланцюгах.
 * Повертає порожній масив якщо COVALENT_API_KEY не задано.
 */
export async function fetchWalletPortfolioHistory(
  address: string,
  network: Network,
): Promise<DailyPortfolioPoint[]> {
  if (!process.env.COVALENT_API_KEY) return [];

  const chainIds =
    network === Network.EVM
      ? EVM_CHAINS.map((c) => COVALENT_CHAIN_ID[c.chainName]).filter(Boolean)
      : [COVALENT_CHAIN_ID.solana];

  const results = await Promise.allSettled(
    chainIds.map((id) => fetchChainDailyTotals(address, id!)),
  );

  // Сумуємо по всіх ланцюгах для кожного дня
  const merged = new Map<string, number>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const [dateKey, usd] of r.value) {
      merged.set(dateKey, (merged.get(dateKey) ?? 0) + usd);
    }
  }

  return Array.from(merged.entries())
    .map(([dateKey, totalUsd]) => ({
      timestamp: new Date(dateKey + 'T00:00:00.000Z').getTime(),
      totalUsd,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
