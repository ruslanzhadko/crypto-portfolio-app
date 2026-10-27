import axios, { AxiosError } from 'axios';
import type { NormalizedToken, NormalizedTransaction } from './token-types';

// ─────────────────────────────────────────────────────────────────────────────
// Ankr Advanced API — multi-chain EVM balance fetching.
//
// Один JSON-RPC виклик повертає всі токени по ВСІХ EVM-ланцюгах одночасно.
// Безкоштовний API ключ: https://www.ankr.com/rpc/ (30M credits/місяць).
// Без ключа — працює, але з агресивним rate-limit.
// Env: ANKR_API_KEY (опційно).
// ─────────────────────────────────────────────────────────────────────────────

const ANKR_CHAINS = [
  'eth',
  'bsc',
  'polygon',
  'avalanche',
  'arbitrum',
  'optimism',
  'base',
  'xlayer',
] as const;

// Ankr blockchain name → наш внутрішній chainName
const ANKR_TO_CHAIN: Record<string, string> = {
  eth: 'ethereum',
  bsc: 'bsc',
  polygon: 'polygon',
  avalanche: 'avalanche',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  xlayer: 'xlayer',
};

// Канонічна інформація про нативний токен кожного ланцюга.
// Ankr іноді повертає неповні або неправильні назви для нативних токенів.
const NATIVE_INFO: Record<string, { symbol: string; name: string }> = {
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  bsc: { symbol: 'BNB', name: 'BNB Chain' },
  polygon: { symbol: 'POL', name: 'Polygon' },
  avalanche: { symbol: 'AVAX', name: 'Avalanche' },
  arbitrum: { symbol: 'ETH', name: 'Arbitrum' },
  optimism: { symbol: 'ETH', name: 'Optimism' },
  base: { symbol: 'ETH', name: 'Base' },
  xlayer: { symbol: 'OKB', name: 'X Layer' },
};

function getEndpoint(): string {
  const key = process.env.ANKR_API_KEY;
  return key
    ? `https://rpc.ankr.com/multichain/${key}`
    : 'https://rpc.ankr.com/multichain';
}

// ─── Ankr response types ───────────────────────────────────────────────────

interface AnkrAsset {
  blockchain: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenType: 'NATIVE' | 'ERC20';
  contractAddress: string;
  holderAddress: string;
  balance: string;           // людино-читабельний баланс, наприклад "0.5"
  balanceRawInteger: string; // raw баланс (без decimals)
  balanceUsd: string;        // USD-вартість балансу
  tokenPrice: string;        // ціна за одиницю токена
  thumbnail: string;         // URL логотипу
}

interface AnkrRpcResult {
  assets: AnkrAsset[];
  totalBalanceUsd: string;
  nextPageToken: string;
}

interface AnkrRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: AnkrRpcResult;
  error?: { code: number; message: string };
}

// ─── Public API ────────────────────────────────────────────────────────────

export class AnkrApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnkrApiError';
  }
}

/**
 * Отримує всі EVM-токени по всіх підтримуваних ланцюгах за ОДИН API-виклик.
 * Повертає масив NormalizedToken, сумісний з wallet-sync.ts.
 *
 * priceChange24h = 0 для всіх токенів — Ankr не повертає 24г-зміну.
 * Поле заповнюється пізніше через price-feed.ts (DexScreener / Binance).
 *
 * @throws {AnkrApiError} якщо будь-яка сторінка не відповіла або є некоректною.
 */
export async function fetchEVMBalancesFromAnkr(
  walletAddress: string,
): Promise<NormalizedToken[]> {
  const results: NormalizedToken[] = [];
  let pageToken: string | undefined;

  do {
    let data: AnkrRpcResponse;

    try {
      const response = await axios.post<AnkrRpcResponse>(
        getEndpoint(),
        {
          jsonrpc: '2.0',
          method: 'ankr_getAccountBalance',
          params: {
            walletAddress,
            blockchain: [...ANKR_CHAINS],
            pageSize: 50,
            ...(pageToken ? { pageToken } : {}),
          },
          id: 1,
        },
        {
          timeout: 30_000,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      data = response.data;
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Ankr] fetchEVMBalances помилка (status=${status ?? 'n/a'}): ${msg}`);
      // Не зберігаємо частковий результат після збою будь-якої сторінки.
      throw new AnkrApiError(`Ankr недоступний: ${msg}`);
    }

    if (data.error) {
      const msg = `RPC ${data.error.code}: ${data.error.message}`;
      console.error(`[Ankr] ${msg}`);
      throw new AnkrApiError(msg);
    }

    if (!data.result || !Array.isArray(data.result.assets)) {
      throw new AnkrApiError('Ankr повернув неповну відповідь');
    }

    const { assets, nextPageToken } = data.result;
    pageToken = nextPageToken || undefined;

    for (const asset of assets) {
      const token = normalizeAnkrAsset(asset);
      if (token) results.push(token);
    }
  } while (pageToken);

  return results;
}

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * Парсить сиру кількість токенів з Ankr.
 * value — рядок з великим цілим числом (напр. "50000000000000000000" = 50 USDT/18dec).
 * Використовує BigInt щоб уникнути втрати точності при parseFloat великих чисел.
 */
function parseRawTokenAmount(value: string | undefined | null, decimals: number): number | null {
  if (!value || value === '0') return null;
  try {
    const raw = BigInt(value);
    if (raw <= 0n) return null;
    // BigInt ділення: число / 10^decimals
    const divisor = 10n ** BigInt(Math.max(0, decimals));
    const whole = Number(raw / divisor);
    const remainder = Number(raw % divisor) / 10 ** decimals;
    const result = whole + remainder;
    return result > 0 ? result : null;
  } catch {
    // Fallback: parseFloat для нецілих рядків (напр. "50.5")
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
}

/** Парсить timestamp Ankr у секундах (число або hex рядок). */
function parseAnkrTimestamp(raw: number | string | undefined): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return raw;
  // Hex рядок: "0x60f5d9c0"
  if (typeof raw === 'string' && raw.startsWith('0x')) return Number.parseInt(raw, 16);
  // Decimal рядок: "1626708414"
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAnkrAsset(asset: AnkrAsset): NormalizedToken | null {
  const chainName = ANKR_TO_CHAIN[asset.blockchain];
  if (!chainName) return null;

  const isNative = asset.tokenType === 'NATIVE';

  // balance — вже відформатований рядок (не raw), парсимо напряму
  const balance = Number.parseFloat(asset.balance);
  if (!Number.isFinite(balance) || balance <= 0) return null;

  const priceUsd = Math.max(0, Number.parseFloat(asset.tokenPrice) || 0);
  const usdValue = Math.max(
    0,
    Number.parseFloat(asset.balanceUsd) || (priceUsd > 0 ? priceUsd * balance : 0),
  );

  // Для нативних токенів беремо канонічні назви (Ankr іноді дає "Ether" замість "Ethereum")
  const native = isNative ? NATIVE_INFO[chainName] : null;
  const symbol = (native?.symbol ?? asset.tokenSymbol?.trim()) || '';
  const name = (native?.name ?? asset.tokenName?.trim()) || symbol;
  if (!symbol) return null;

  const contractAddress = isNative ? '' : (asset.contractAddress?.toLowerCase() ?? '');

  // Ankr надає thumbnail тільки для відомих токенів.
  // Не встановлюємо спекулятивний CDN URL — він часто 404-ить і блокує
  // реальний логотип з DexScreener API (applyPriceToToken перевіряє !t.logoUrl).
  const logoUrl = asset.thumbnail || null;

  return {
    symbol,
    name,
    address: contractAddress,
    decimals: asset.tokenDecimals ?? 18,
    balance,
    usdValue,
    priceUsd,
    priceChange24h: 0, // заповнюється після sync через price-feed.ts
    logoUrl: logoUrl || null,
    isNative,
    chainName,
    // isSpam обчислюється у wallet-sync.ts після enrichMissingPrices
    // (DexScreener може знайти ціну для токена, якого Ankr не оцінив)
    isSpam: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EVM Transactions via ankr_getTokenTransfers
//
// Повертає ERC-20 перекази з реальними назвами токенів.
// Групує по transactionHash → визначає send / receive / swap.
// ─────────────────────────────────────────────────────────────────────────────

interface AnkrTokenTransfer {
  blockchain: string;
  transactionHash?: string;
  fromAddress?: string;
  toAddress?: string;
  contractAddress?: string;
  value?: string;          // human-readable amount (including integer strings)
  valueRawInteger?: string; // amount in smallest units
  tokenDecimals?: number;
  tokenName?: string;
  tokenSymbol?: string;
  blockHeight?: number;    // decimal block number
  // Ankr повертає timestamp у різних полях залежно від версії API:
  blockTimestamp?: number | string;
  timestamp?: number | string;
  syncTimestamp?: number;
  thumbnail?: string;
}

interface AnkrTokenTransferResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    transfers: AnkrTokenTransfer[];
    nextPageToken: string;
  };
  error?: { code: number; message: string };
}

function tokenTransferAmount(transfer: AnkrTokenTransfer): number | null {
  if (transfer.valueRawInteger !== undefined) {
    return parseRawTokenAmount(transfer.valueRawInteger, transfer.tokenDecimals ?? 18);
  }
  // Integer-looking values are still human amounts: "100" means 100 USDT.
  const value = Number(transfer.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// URL-паттерни скам-токенів
const SPAM_TX_PATTERNS = /t\.me|\.com|\.io|\.xyz|\.net|http|www\.|airdrop|claim|visit|reward/i;
// Мінімальна сума для ERC-20: менше цього = пил або скам-аірдроп
const MIN_TOKEN_TX = 0.001;

export interface TransactionPageResult {
  transactions: NormalizedTransaction[];
  /** Ankr page token для наступної сторінки; undefined = більше немає */
  nextPageToken?: string;
}

/**
 * Сторінкова вибірка EVM-транзакцій безпосередньо від Ankr (без БД).
 *
 * pageToken = undefined → перша сторінка (також включає нативні ETH/BNB перекази).
 * pageToken = string   → продовження від попередньої сторінки (тільки ERC-20).
 *
 * Якщо після фільтрації результатів менше ніж мінімум — автоматично запитує
 * наступну пачку (до MAX_ANKR_FETCHES разів), щоб не показувати порожні сторінки.
 */
export async function fetchTransactionsPage(
  walletAddress: string,
  pageToken?: string,
  pageSize = 20,
): Promise<TransactionPageResult> {
  const wallet = walletAddress.toLowerCase();
  const RAW_PAGE = 100;
  const MIN_RESULTS = pageSize;
  // Максимум 2 Ankr-запити на одну сторінку — захист від rate limit на Freemium
  const MAX_ANKR_FETCHES = 2;

  const collected: NormalizedTransaction[] = [];
  const calls: WalletCall[] = [];
  let currentToken = pageToken;
  let finalNextToken: string | undefined;
  let isFirst = true;

  for (let attempt = 0; attempt < MAX_ANKR_FETCHES; attempt++) {
    const [tokenResult, nativeResult] = await Promise.allSettled([
      fetchAnkrTokenTransfersPage(wallet, RAW_PAGE, currentToken),
      // Нативні ETH/BNB — тільки на першому запиті першої сторінки
      isFirst && !pageToken
        ? fetchAnkrNativeTransfersRaw(wallet, pageSize)
        : Promise.resolve({ transfers: [], calls: [] }),
    ]);
    isFirst = false;

    const tokenData = tokenResult.status === 'fulfilled'
      ? tokenResult.value
      : { transfers: [], nextPageToken: undefined };
    const nativeData = nativeResult.status === 'fulfilled'
      ? nativeResult.value
      : { transfers: [], calls: [] };
    calls.push(...nativeData.calls);

    const classified = classifyTokenTransfers(wallet, tokenData.transfers);
    const nativeTxs = nativeData.transfers as NormalizedTransaction[];
    const erc20Hashes = new Set(classified.map((t) => t.hash));
    const uniqueNative = nativeTxs.filter((t) => !erc20Hashes.has(t.hash));

    collected.push(...classified, ...uniqueNative);

    finalNextToken = tokenData.nextPageToken;
    currentToken = finalNextToken;

    // Зупиняємось якщо маємо достатньо або Ankr більше не має даних
    if (collected.length >= MIN_RESULTS || !finalNextToken) break;
  }

  const nativeIn = await fetchNativeIn(wallet, collected, calls);
  const sorted = attachNativeLegs(collected, calls, nativeIn)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return {
    // The cursor is after ALL raw events in this batch. Callers reveal 20 at
    // a time and keep the remainder, even on the final provider page.
    transactions: sorted,
    nextPageToken: finalNextToken,
  };
}

async function fetchAnkrTokenTransfersPage(
  wallet: string,
  rawSize: number,
  pageToken?: string,
): Promise<{ transfers: AnkrTokenTransfer[]; nextPageToken?: string }> {
  try {
    const { data } = await axios.post<AnkrTokenTransferResponse>(
      getEndpoint(),
      {
        jsonrpc: '2.0',
        method: 'ankr_getTokenTransfers',
        params: {
          address: [wallet],
          blockchain: [...ANKR_CHAINS],
          pageSize: rawSize,
          descOrder: true,
          ...(pageToken ? { pageToken } : {}),
        },
        id: 3,
      },
      { timeout: 25_000, headers: { 'Content-Type': 'application/json' } },
    );
    if (data.error) {
      console.warn(`[Ankr] getTokenTransfers ${data.error.code}: ${data.error.message}`);
      return { transfers: [] };
    }
    return {
      transfers: data.result?.transfers ?? [],
      nextPageToken: data.result?.nextPageToken || undefined,
    };
  } catch (err) {
    console.warn('[Ankr] fetchAnkrTokenTransfersPage:', err instanceof Error ? err.message : err);
    return { transfers: [] };
  }
}

async function fetchAnkrNativeTransfersRaw(
  wallet: string,
  limit: number,
): Promise<{ transfers: NormalizedTransaction[]; calls: WalletCall[] }> {
  return fetchAnkrNativeActivity(wallet, limit);
}

/**
 * Отримує EVM-транзакції: ERC-20 token transfers + нативні (ETH/BNB) перекази.
 * Обидва джерела запитуються паралельно через Ankr Advanced API.
 * Нативні дедублюються з ERC-20 (якщо той самий хеш є в обох — перемагає ERC-20).
 */
export async function fetchEVMTransactionsFromAnkr(
  walletAddress: string,
  limit = 100,
): Promise<NormalizedTransaction[]> {
  const wallet = walletAddress.toLowerCase();

  const [tokenResult, nativeResult] = await Promise.allSettled([
    fetchAnkrTokenTransfers(wallet, limit),
    fetchAnkrNativeTransfers(wallet, limit),
  ]);

  const tokenTxs = tokenResult.status === 'fulfilled' ? tokenResult.value : [];
  const nativeTxs = nativeResult.status === 'fulfilled' ? nativeResult.value : [];

  // Дедуплікація: якщо хеш вже є в ERC-20 — нативна версія не потрібна
  const tokenHashes = new Set(tokenTxs.map((t) => t.hash));
  const uniqueNative = nativeTxs.filter((t) => !tokenHashes.has(t.hash));

  return [...tokenTxs, ...uniqueNative]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

async function fetchAnkrTokenTransfers(
  wallet: string,
  limit: number,
): Promise<NormalizedTransaction[]> {
  try {
    const { data } = await axios.post<AnkrTokenTransferResponse>(
      getEndpoint(),
      {
        jsonrpc: '2.0',
        method: 'ankr_getTokenTransfers',
        params: {
          address: [wallet],
          blockchain: [...ANKR_CHAINS],
          pageSize: limit * 2,
          descOrder: true,
        },
        id: 3,
      },
      { timeout: 25_000, headers: { 'Content-Type': 'application/json' } },
    );
    if (data.error) {
      console.warn(`[Ankr] getTokenTransfers ${data.error.code}: ${data.error.message}`);
      return [];
    }
    return classifyTokenTransfers(wallet, data.result?.transfers ?? []);
  } catch (err) {
    console.warn('[Ankr] fetchAnkrTokenTransfers:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Total of the transfers of the same token as `first` (null when none has a readable amount). */
function sumSameToken(group: AnkrTokenTransfer[], first: AnkrTokenTransfer): number | null {
  const contract = first.contractAddress?.toLowerCase();
  const amounts = group
    .filter((t) => (t.contractAddress?.toLowerCase() ?? null) === (contract ?? null) && t.tokenSymbol === first.tokenSymbol)
    .map(tokenTransferAmount)
    .filter((amount): amount is number => amount !== null);
  return amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
}

/** A contract call the wallet sent itself (router, bridge...), with the native coin it attached. */
export interface WalletCall { hash: string; chainName: string; value: number }

/**
 * Token transfers alone miss the native coin of a DEX trade: buying a token for ETH sends ETH as the
 * call's value, and selling returns ETH in an internal transaction. With the wallet's own calls and
 * the internal ETH it received, those one-sided rows become swaps ("ETH → ZC", "ZC → ETH").
 */
export function attachNativeLegs(
  txs: NormalizedTransaction[],
  calls: readonly WalletCall[],
  nativeIn: ReadonlyMap<string, number>,
): NormalizedTransaction[] {
  const byHash = new Map(calls.map((call) => [call.hash.toLowerCase(), call]));
  return txs.map((tx) => {
    if (!tx.tokenSymbol) return tx;
    const found = byHash.get(tx.hash.toLowerCase());
    const call = found?.chainName === tx.chainName ? found : undefined;
    const native = NATIVE_INFO[tx.chainName]?.symbol ?? 'ETH';
    // A buy needs the wallet's own call (the ETH it attached); a sell only the ETH it got back.
    if (tx.type === 'receive' && call && call.value > 0) {
      return {
        ...tx, type: 'swap', tokenSymbol: `${native} → ${tx.tokenSymbol}`, tokenName: `${native} → ${tx.tokenSymbol}`,
        sentValue: call.value, fromAddress: tx.toAddress, logoUrl: null, swapLogoUrl: tx.logoUrl ?? null,
        swapOutTokenAddress: null, swapInTokenAddress: tx.tokenAddresses?.[0] ?? null,
      };
    }
    const received = nativeIn.get(tx.hash.toLowerCase()) ?? 0;
    if (tx.type === 'send' && received > 0) {
      return {
        ...tx, type: 'swap', tokenSymbol: `${tx.tokenSymbol} → ${native}`, tokenName: `${tx.tokenSymbol} → ${native}`,
        sentValue: tx.value, value: received, toAddress: tx.fromAddress, swapLogoUrl: null,
        swapOutTokenAddress: tx.tokenAddresses?.[0] ?? null, swapInTokenAddress: null,
      };
    }
    return tx;
  });
}

const ETHERSCAN = 'https://api.etherscan.io/v2/api';
const CHAIN_IDS: Record<string, number> = {
  ethereum: 1, bsc: 56, polygon: 137, avalanche: 43114, arbitrum: 42161, optimism: 10, base: 8453, xlayer: 196,
};
/** Settled transactions never change, so their internal transfers are cached for the process. */
const nativeInCache = new Map<string, number>();
const MAX_INTERNAL_LOOKUPS = 12;

/**
 * Native coin a wallet received inside its token sends (DEX sells), read from Etherscan's internal
 * transactions for a few candidates per page. The wallet's own recent calls go first, but any send
 * qualifies: the call list covers only the latest transactions, and relayed swaps (CowSwap,
 * UniswapX) are not the wallet's calls at all. Failures leave the row a plain send.
 */
async function fetchNativeIn(wallet: string, txs: NormalizedTransaction[], calls: readonly WalletCall[]) {
  const result = new Map<string, number>();
  const key = process.env.ETHERSCAN_API_KEY?.trim();
  const own = new Set(calls.map((call) => call.hash.toLowerCase()));
  const candidates = txs
    .filter((tx) => tx.type === 'send' && !!tx.tokenSymbol && CHAIN_IDS[tx.chainName])
    .sort((a, b) => Number(own.has(b.hash.toLowerCase())) - Number(own.has(a.hash.toLowerCase())))
    .slice(0, MAX_INTERNAL_LOOKUPS);
  await Promise.all(candidates.map(async (tx) => {
    const hash = tx.hash.toLowerCase();
    const cached = nativeInCache.get(hash);
    if (cached !== undefined) { result.set(hash, cached); return; }
    if (!key) return;
    try {
      const { data } = await axios.get<{ status: string; result: { to?: string; value?: string; isError?: string }[] | string }>(
        ETHERSCAN,
        { timeout: 8_000, params: { chainid: CHAIN_IDS[tx.chainName], module: 'account', action: 'txlistinternal', txhash: hash, apikey: key } },
      );
      // "No transactions found" is a valid empty answer; anything else non-array is an error.
      const rows = Array.isArray(data.result) ? data.result : [];
      if (!Array.isArray(data.result) && data.status !== '0') return;
      const wei = rows
        .filter((row) => row.isError !== '1' && row.to?.toLowerCase() === wallet)
        .reduce((sum, row) => sum + Number(row.value ?? 0), 0);
      const value = Number.isFinite(wei) ? wei / 1e18 : 0;
      nativeInCache.set(hash, value);
      result.set(hash, value);
    } catch (err) {
      console.warn('[Etherscan] internal transfers:', err instanceof Error ? err.message : err);
    }
  }));
  return result;
}

/**
 * Групує сирі token-transfer події по transactionHash,
 * визначає напрямок відносно walletAddress і повертає NormalizedTransaction[].
 */
export function classifyTokenTransfers(
  wallet: string,
  transfers: AnkrTokenTransfer[],
): NormalizedTransaction[] {
  // Групуємо переміщення по хешу
  const byHash = new Map<string, AnkrTokenTransfer[]>();
  for (const t of transfers) {
    const hash = t.transactionHash;
    if (!hash) continue;
    const arr = byHash.get(hash) ?? [];
    arr.push(t);
    byHash.set(hash, arr);
  }

  const results: NormalizedTransaction[] = [];

  for (const [hash, group] of byHash) {
    const first = group[0]!;
    const chainName = ANKR_TO_CHAIN[first.blockchain];
    if (!chainName) continue;

    const sent = group.filter((t) => t.fromAddress?.toLowerCase() === wallet);
    const received = group.filter((t) => t.toAddress?.toLowerCase() === wallet);

    let type: string;
    let tokenSymbol: string | null;
    let tokenName: string | null;
    let value: number | null;
    let fromAddress: string | null = null;
    let toAddress: string | null = null;

    // ── Спам-перевірка по ОКРЕМИХ символах (ДО побудови "A → B") ──────────
    // Увага: tokenSymbol для свопу містить "→" (non-ASCII), тому фільтруємо
    // на рівні окремих transfer-записів, а не фінального рядка.
    const allEntries = [...sent, ...received];
    if (allEntries.some((t) => /[^\x00-\x7F]/.test(t.tokenSymbol ?? ''))) continue;
    if (allEntries.some(
      (t) =>
        SPAM_TX_PATTERNS.test(t.tokenSymbol ?? '') ||
        SPAM_TX_PATTERNS.test(t.tokenName ?? ''),
    )) continue;

    const isSwap = sent.length > 0 && received.length > 0;

    let sentValue: number | null = null;

    if (isSwap) {
      type = 'swap';
      const outSymbols = [...new Set(sent.map((t) => t.tokenSymbol).filter(Boolean))];
      const inSymbols  = [...new Set(received.map((t) => t.tokenSymbol).filter(Boolean))];
      tokenSymbol = `${outSymbols.join(', ')} → ${inSymbols.join(', ')}`;
      tokenName   = tokenSymbol;
      value     = received.reduce((sum, t) => sum + (tokenTransferAmount(t) ?? 0), 0) || null;
      sentValue = sent.reduce(    (sum, t) => sum + (tokenTransferAmount(t) ?? 0), 0) || null;
      fromAddress = wallet;
      toAddress   = wallet;
    } else if (sent.length > 0) {
      type = 'send';
      const s  = sent[0]!;
      tokenSymbol = s.tokenSymbol?.trim() || null;
      tokenName   = s.tokenName?.trim()   || tokenSymbol;
      value       = sumSameToken(sent, s);
      fromAddress = wallet;
      toAddress   = s.toAddress?.toLowerCase() ?? null;
    } else {
      type = 'receive';
      const r  = received[0]!;
      tokenSymbol = r.tokenSymbol?.trim() || null;
      tokenName   = r.tokenName?.trim()   || tokenSymbol;
      value       = sumSameToken(received, r);
      fromAddress = r.fromAddress?.toLowerCase() ?? null;
      toAddress   = wallet;
    }

    if (!tokenSymbol) continue;
    // Null або мікросума → пустий запис / показувалось би як "+0"
    if (!value || value < MIN_TOKEN_TX) continue;

    const ts = parseAnkrTimestamp(first.blockTimestamp ?? first.timestamp ?? first.syncTimestamp);
    const blockNumber = first.blockHeight ? BigInt(first.blockHeight) : null;

    results.push({
      hash,
      chainName,
      type,
      tokenSymbol,
      tokenName,
      tokenAddresses: [...new Set(allEntries.map((t) => t.contractAddress?.toLowerCase()).filter((address): address is string => !!address))],
      swapOutTokenAddress: isSwap ? sent[0]?.contractAddress?.toLowerCase() ?? null : null,
      swapInTokenAddress: isSwap ? received[0]?.contractAddress?.toLowerCase() ?? null : null,
      logoUrl: (sent[0] ?? received[0])?.thumbnail ?? null,
      swapLogoUrl: isSwap ? received[0]?.thumbnail ?? null : null,
      fromAddress,
      toAddress,
      value,
      sentValue,
      usdValue: null,
      gasUsed: null,
      status: 'success',
      blockNumber,
      timestamp: new Date(ts * 1000),
    });
  }

  return results;
}

// ─── Native transactions (ETH/BNB simple transfers) ────────────────────────

interface AnkrNativeTx {
  hash?: string;
  transactionHash?: string;
  blockchain: string;
  from?: string;
  to?: string | null;
  value?: string;
  gasUsed?: string;
  status?: string;
  blockNumber?: string;
  blockTimestamp?: string | number;
  timestamp?: string | number;
  input?: string;
}

interface AnkrNativeTxResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { transactions: AnkrNativeTx[]; nextPageToken: string };
  error?: { code: number; message: string };
}

async function fetchAnkrNativeTransfers(
  wallet: string,
  limit: number,
): Promise<NormalizedTransaction[]> {
  return (await fetchAnkrNativeActivity(wallet, limit)).transfers;
}

async function fetchAnkrNativeActivity(
  wallet: string,
  limit: number,
): Promise<{ transfers: NormalizedTransaction[]; calls: WalletCall[] }> {
  try {
    const { data } = await axios.post<AnkrNativeTxResponse>(
      getEndpoint(),
      {
        jsonrpc: '2.0',
        method: 'ankr_getTransactionsByAddress',
        params: {
          address: [wallet],
          blockchain: [...ANKR_CHAINS],
          pageSize: limit,
          descOrder: true,
        },
        id: 4,
      },
      { timeout: 25_000, headers: { 'Content-Type': 'application/json' } },
    );
    if (data.error) {
      console.warn(`[Ankr] getNativeTxs ${data.error.code}: ${data.error.message}`);
      return { transfers: [], calls: [] };
    }

    const results: NormalizedTransaction[] = [];
    const calls: WalletCall[] = [];
    for (const tx of data.result?.transactions ?? []) {
      const hash = tx.hash ?? tx.transactionHash;
      if (!hash) continue;

      const chainName = ANKR_TO_CHAIN[tx.blockchain];
      if (!chainName) continue;
      // Тільки успішні
      if (tx.status && tx.status !== '0x1') continue;

      // Contract calls are not transfers themselves, but they carry a DEX trade's native leg.
      if (tx.input && tx.input !== '0x' && tx.input !== '0x0') {
        if (tx.from?.toLowerCase() === wallet) {
          const attached = Number.parseInt(tx.value ?? '0x0', 16) / 1e18;
          calls.push({ hash, chainName, value: Number.isFinite(attached) ? attached : 0 });
        }
        continue;
      }

      const weiHex = tx.value ?? '0x0';
      const valueWei = Number.parseInt(weiHex, 16);
      if (!Number.isFinite(valueWei) || valueWei <= 0) continue;
      const value = valueWei / 1e18;
      if (value < 0.0001) continue;

      const native = NATIVE_INFO[chainName];
      const isOutgoing = tx.from?.toLowerCase() === wallet;
      const ts = parseAnkrTimestamp(tx.blockTimestamp ?? tx.timestamp);
      const blockNumber = tx.blockNumber ? BigInt(Number.parseInt(tx.blockNumber, 16)) : null;

      results.push({
        hash,
        chainName,
        type: isOutgoing ? 'send' : 'receive',
        tokenSymbol: native?.symbol ?? 'ETH',
        tokenName: native?.name ?? chainName,
        fromAddress: tx.from?.toLowerCase() ?? null,
        toAddress: tx.to?.toLowerCase() ?? null,
        value,
        usdValue: null,
        gasUsed: tx.gasUsed ? Number.parseInt(tx.gasUsed, 16) : null,
        status: 'success',
        blockNumber,
        timestamp: new Date((Number.isFinite(ts) ? ts : 0) * 1000),
      });
    }
    return { transfers: results, calls };
  } catch (err) {
    console.warn('[Ankr] fetchAnkrNativeTransfers:', err instanceof Error ? err.message : err);
    return { transfers: [], calls: [] };
  }
}
