import axios, { AxiosError, type AxiosInstance } from 'axios';
import { Network } from '@prisma/client';
import { EVM_CHAINS, type ChainInfo } from '@/lib/utils/networks';

const EVM_BASE = 'https://deep-index.moralis.io/api/v2.2';
const SOLANA_BASE = 'https://solana-gateway.moralis.io';

// Мінімальна USD-вартість токена для збереження в БД (спам-фільтр за вартістю)
export const MIN_TOKEN_USD = 0.10;

let evmClient: AxiosInstance | null = null;
let solanaClient: AxiosInstance | null = null;

function getEvmClient(): AxiosInstance {
  if (evmClient) return evmClient;
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new MoralisConfigError('MORALIS_API_KEY не встановлено');
  evmClient = axios.create({
    baseURL: EVM_BASE,
    timeout: 20000,
    headers: { accept: 'application/json', 'X-API-Key': key },
  });
  return evmClient;
}

function getSolanaClient(): AxiosInstance {
  if (solanaClient) return solanaClient;
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new MoralisConfigError('MORALIS_API_KEY не встановлено');
  solanaClient = axios.create({
    baseURL: SOLANA_BASE,
    timeout: 20000,
    headers: { accept: 'application/json', 'X-API-Key': key },
  });
  return solanaClient;
}

export class MoralisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoralisConfigError';
  }
}

export class MoralisApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MoralisApiError';
    this.status = status;
  }
}

// ─────────────────────────────────────────
// Retry helper
// ─────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw new MoralisApiError(
          err instanceof AxiosError
            ? ((err.response?.data as { message?: string })?.message ?? err.message)
            : 'Невідома помилка',
          status,
        );
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
      }
    }
  }
  if (lastErr instanceof AxiosError) {
    throw new MoralisApiError(lastErr.message, lastErr.response?.status);
  }
  throw new MoralisApiError('Помилка Moralis API після повторних спроб');
}

// ─────────────────────────────────────────
// Типи
// ─────────────────────────────────────────

export interface NormalizedToken {
  symbol: string;
  name: string;
  address: string;     // "" для нативних токенів
  decimals: number;
  balance: number;
  usdValue: number;
  priceUsd: number;       // ціна за одиницю токена
  priceChange24h: number; // % зміна за 24 год
  logoUrl: string | null;
  isNative: boolean;
  chainName: string;   // "ethereum" | "bsc" | "polygon" | ... | "solana"
  isSpam: boolean;     // позначений як спам Moralis
}

export interface NormalizedTransaction {
  hash: string;
  chainName: string;
  type: string;
  tokenSymbol: string | null;
  tokenName: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  value: number | null;       // для свопу: сума отриманого (in)
  sentValue?: number | null;  // для свопу: сума продано (out)
  usdValue: number | null;
  gasUsed: number | null;
  status: string;
  blockNumber: bigint | null;
  timestamp: Date;
}

// ─────────────────────────────────────────
// EVM — один запит на кожну з 7 мереж
// ─────────────────────────────────────────

interface EvmTokenItem {
  token_address?: string;
  symbol?: string;
  name?: string;
  logo?: string | null;
  thumbnail?: string | null;
  decimals?: number | string;
  balance?: string;
  balance_formatted?: string;
  usd_price?: number | null;
  usd_price_24hr_percent_change?: number | null;
  usd_value?: number | null;
  native_token?: boolean;
  possible_spam?: boolean;
}

interface EvmNativeBalance {
  balance?: string;
}

interface EvmTxItem {
  hash?: string;
  block_number?: string;
  block_timestamp?: string;
  from_address?: string;
  to_address?: string;
  value?: string;
  receipt_gas_used?: string;
  receipt_status?: string;
  category?: string;
  method_label?: string;
}

async function fetchOneEvmChain(
  address: string,
  chain: ChainInfo,
): Promise<NormalizedToken[]> {
  const client = getEvmClient();

  const [nativeRes, tokensRes] = await Promise.allSettled([
    withRetry(() =>
      client.get<EvmNativeBalance>(`/${address}/balance`, {
        params: { chain: chain.moralisId },
      }),
    ),
    withRetry(() =>
      client.get<{ result?: EvmTokenItem[] } | EvmTokenItem[]>(
        `/wallets/${address}/tokens`,
        { params: { chain: chain.moralisId, exclude_spam: true } },
      ),
    ),
  ]);

  const results: NormalizedToken[] = [];

  // Нативний токен
  if (nativeRes.status === 'fulfilled') {
    const raw = nativeRes.value.data?.balance;
    if (raw) {
      const balance = Number(raw) / 1e18;
      if (Number.isFinite(balance) && balance > 0) {
        results.push({
          symbol: chain.symbol,
          name: chain.displayName,
          address: '',
          decimals: 18,
          balance,
          usdValue: 0,
          priceUsd: 0,
          priceChange24h: 0,
          logoUrl: null,
          isNative: true,
          chainName: chain.chainName,
          isSpam: false,
        });
      }
    }
  }

  // ERC-20 + native токени з /wallets/tokens (Moralis може повертати native тут теж)
  if (tokensRes.status === 'fulfilled') {
    const raw = tokensRes.value.data;
    const items: EvmTokenItem[] = Array.isArray(raw) ? raw : (raw?.result ?? []);
    for (const t of items) {
      const normalized = normalizeEvmToken(t, chain.chainName);
      if (normalized) results.push(normalized);
    }
  }

  // Дедуп: якщо native токен прийшов і з /balance, і з /wallets/tokens — лишаємо запис з ціною
  return dedupeTokens(results);
}

/**
 * Дедуплікує токени за (chainName, address, symbol). Якщо є дублі (тобто Moralis
 * повернув один і той самий токен з двох ендпоінтів) — лишаємо запис із ненульовою
 * ціною, інакше з більшим usdValue.
 */
function dedupeTokens(tokens: NormalizedToken[]): NormalizedToken[] {
  const map = new Map<string, NormalizedToken>();
  for (const t of tokens) {
    const key = `${t.chainName}::${t.address}::${t.symbol.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, t);
      continue;
    }
    // Обираємо кращий запис: пріоритет — priceUsd > 0, потім usdValue
    const better =
      (t.priceUsd > 0 && existing.priceUsd === 0) ||
      (t.priceUsd === existing.priceUsd && t.usdValue > existing.usdValue)
        ? t
        : existing;
    map.set(key, better);
  }
  return Array.from(map.values());
}

function normalizeEvmToken(t: EvmTokenItem, chainName: string): NormalizedToken | null {
  const symbol = t.symbol?.trim() ?? '';
  if (!symbol) return null;

  const isNative = t.native_token === true;
  const isSpam = t.possible_spam === true;
  const decimals = typeof t.decimals === 'string' ? Number(t.decimals) : (t.decimals ?? 18);

  let balance: number;
  if (typeof t.balance_formatted === 'string') {
    balance = Number(t.balance_formatted);
  } else if (typeof t.balance === 'string') {
    balance = Number(t.balance) / 10 ** decimals;
  } else {
    balance = 0;
  }
  if (!Number.isFinite(balance) || balance <= 0) return null;

  const priceUsd =
    typeof t.usd_price === 'number' && t.usd_price > 0 ? t.usd_price : 0;

  const usdValue =
    typeof t.usd_value === 'number' && t.usd_value > 0
      ? t.usd_value
      : priceUsd > 0
        ? priceUsd * balance
        : 0;

  const rawChange = typeof t.usd_price_24hr_percent_change === 'number' &&
    Number.isFinite(t.usd_price_24hr_percent_change)
      ? t.usd_price_24hr_percent_change
      : 0;
  // Ціна не може впасти більш ніж на 100%; значення поза [-99.9, 10000] — брудні дані Moralis
  const priceChange24h = rawChange !== 0 ? Math.max(-99.9, Math.min(rawChange, 10_000)) : 0;

  return {
    symbol,
    name: t.name?.trim() || symbol,
    // Для нативних токенів примусово '' щоб збігалось з рядком від /balance і дедуп працював
    address: isNative ? '' : (t.token_address ?? ''),
    decimals,
    balance,
    usdValue,
    priceUsd,
    priceChange24h,
    logoUrl: t.logo ?? t.thumbnail ?? null,
    isNative,
    chainName,
    isSpam,
  };
}

async function fetchEvmTransactionsForChain(
  address: string,
  chain: ChainInfo,
  limit: number,
): Promise<NormalizedTransaction[]> {
  const client = getEvmClient();
  try {
    const { data } = await withRetry(() =>
      client.get<{ result?: EvmTxItem[] }>(`/wallets/${address}/history`, {
        params: { chain: chain.moralisId, limit },
      }),
    );
    return (data.result ?? [])
      .filter((tx) => !!tx.hash)
      .map((tx) => ({
        hash: tx.hash ?? '',
        chainName: chain.chainName,
        type: tx.category ?? tx.method_label ?? 'transfer',
        tokenSymbol: chain.symbol,
        tokenName: chain.displayName,
        fromAddress: tx.from_address ?? null,
        toAddress: tx.to_address ?? null,
        value: tx.value ? Number(tx.value) / 1e18 : null,
        usdValue: null,
        gasUsed: tx.receipt_gas_used ? Number(tx.receipt_gas_used) : null,
        status: tx.receipt_status === '1' ? 'success' : 'failed',
        blockNumber: tx.block_number ? BigInt(tx.block_number) : null,
        timestamp: tx.block_timestamp ? new Date(tx.block_timestamp) : new Date(),
      }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────
// Solana
// ─────────────────────────────────────────

interface SolanaTokenItem {
  mint?: string;
  amount?: string;
  decimals?: number;
  name?: string;
  symbol?: string;
  logo?: string | null;
  associatedTokenAddress?: string;
}

interface SolanaBalance {
  solana?: string;
}

async function fetchSolanaTokens(address: string): Promise<NormalizedToken[]> {
  const client = getSolanaClient();
  const { data } = await withRetry(() =>
    client.get<SolanaTokenItem[]>(`/account/mainnet/${address}/tokens`),
  );

  const results: NormalizedToken[] = [];

  // Нативний SOL
  try {
    const balRes = await withRetry(() =>
      client.get<SolanaBalance>(`/account/mainnet/${address}/balance`),
    );
    const sol = Number(balRes.data?.solana ?? 0);
    if (Number.isFinite(sol) && sol > 0) {
      results.push({
        symbol: 'SOL',
        name: 'Solana',
        address: '',
        decimals: 9,
        balance: sol,
        usdValue: 0,
        priceUsd: 0,
        priceChange24h: 0,
        logoUrl: null,
        isNative: true,
        chainName: 'solana',
        isSpam: false,
      });
    }
  } catch {
    // ignore
  }

  for (const t of Array.isArray(data) ? data : []) {
    const symbol = t.symbol?.trim() ?? '';
    if (!symbol) continue;
    const balance = t.amount ? Number(t.amount) : 0;
    if (!Number.isFinite(balance) || balance <= 0) continue;
    results.push({
      symbol,
      name: t.name?.trim() || symbol,
      address: t.mint ?? '',
      decimals: t.decimals ?? 9,
      balance,
      usdValue: 0,
      priceUsd: 0,
      priceChange24h: 0,
      logoUrl: t.logo ?? null,
      isNative: false,
      chainName: 'solana',
      isSpam: false,
    });
  }

  return results;
}

// Moralis Solana Gateway не має ендпоінту /transactions (є лише balance/tokens/portfolio/nft/swaps).
// Використовуємо публічний Solana JSON-RPC метод getSignaturesForAddress — безкоштовний, без ключа.
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

interface SolanaSignatureItem {
  signature: string;
  slot?: number;
  blockTime?: number | null;
  err?: unknown;
  memo?: string | null;
  confirmationStatus?: string;
}

interface SolanaRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function fetchSolanaTransactions(
  address: string,
  limit: number,
): Promise<NormalizedTransaction[]> {
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit: Math.min(Math.max(limit, 1), 1000) }],
      }),
    });

    if (!res.ok) {
      console.warn(`[solana-rpc] HTTP ${res.status} for getSignaturesForAddress`);
      return [];
    }

    const json = (await res.json()) as SolanaRpcResponse<SolanaSignatureItem[]>;
    if (json.error) {
      console.warn(`[solana-rpc] error: ${json.error.message}`);
      return [];
    }

    const items = json.result ?? [];
    return items
      .filter((tx) => !!tx.signature)
      .map((tx) => ({
        hash: tx.signature,
        chainName: 'solana',
        // memo іноді натякає на тип; інакше — generic 'transfer'
        type: tx.memo ? 'memo' : 'transfer',
        tokenSymbol: 'SOL',
        tokenName: 'Solana',
        fromAddress: null,
        toAddress: null,
        value: null,
        usdValue: null,
        gasUsed: null,
        status: tx.err ? 'failed' : 'success',
        blockNumber: tx.slot ? BigInt(tx.slot) : null,
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
      }));
  } catch (err) {
    console.warn('[solana-rpc] fetch failed:', err);
    return [];
  }
}

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/**
 * Для EVM — паралельно запитуємо всі 7 мереж по одній адресі.
 * Для SOLANA — окремий ендпоінт.
 */
export async function fetchWalletTokens(
  address: string,
  network: Network,
): Promise<NormalizedToken[]> {
  if (network === Network.SOLANA) {
    return fetchSolanaTokens(address).catch(() => []);
  }

  // EVM: всі 7 ланцюгів паралельно
  const chainResults = await Promise.allSettled(
    EVM_CHAINS.map((chain) => fetchOneEvmChain(address, chain)),
  );

  const all: NormalizedToken[] = [];
  for (const r of chainResults) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all;
}

export async function fetchWalletTransactions(
  address: string,
  network: Network,
  limitPerChain = 25,
): Promise<NormalizedTransaction[]> {
  if (network === Network.SOLANA) {
    return fetchSolanaTransactions(address, limitPerChain);
  }

  // EVM: транзакції з усіх 7 ланцюгів, сортуємо по timestamp
  const chainResults = await Promise.allSettled(
    EVM_CHAINS.map((chain) =>
      fetchEvmTransactionsForChain(address, chain, limitPerChain),
    ),
  );

  const all: NormalizedTransaction[] = [];
  for (const r of chainResults) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
