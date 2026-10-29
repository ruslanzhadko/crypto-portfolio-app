import type { NormalizedToken } from './token-types';
import { friendlyTonAddress, parseTonAddress, rawTonAddress } from '@/lib/utils/ton-address';
import { getChainInfo } from '@/lib/utils/networks';

/**
 * TON balances and history from TonAPI (tonapi.io). Without `TONAPI_KEY` the free tier allows about
 * one request per second, so calls go one after another and a 429 waits and retries.
 * The native coin is Gram (GRAM, formerly Toncoin); TonAPI still names its rate `TON`.
 */
const BASE = 'https://tonapi.io/v2';
const RETRIES = 3;
const NATIVE_DECIMALS = 9;
export const TON_COINGECKO_ID = 'the-open-network';

export class TonApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TonApiError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const key = process.env.TONAPI_KEY?.trim();
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${BASE}${path}`, {
      headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429 && attempt < RETRIES) {
      await sleep(1_100 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new TonApiError(`TonAPI HTTP ${res.status}`, res.status);
    return (await res.json()) as T;
  }
}

/** "+1.20%" or "−2.20%" (TonAPI uses the Unicode minus) → 1.2 / -2.2. */
export function parsePercent(value: string | undefined): number {
  if (!value) return 0;
  const number = Number.parseFloat(value.replace('−', '-').replace('%', ''));
  return Number.isFinite(number) ? number : 0;
}

function units(raw: string | number, decimals: number): number {
  const value = Number(raw) / 10 ** decimals;
  return Number.isFinite(value) ? value : 0;
}

interface JettonInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  image?: string;
  verification?: 'whitelist' | 'none' | 'blacklist' | string;
}
interface JettonBalance {
  balance: string;
  price?: { prices?: { USD?: number }; diff_24h?: { USD?: string } };
  wallet_address?: { is_scam?: boolean };
  jetton: JettonInfo;
}

export async function fetchTonBalances(address: string, fetchImpl: typeof fetch = fetch): Promise<NormalizedToken[]> {
  const id = encodeURIComponent(address);
  const account = await get<{ balance?: number | string }>(`/accounts/${id}`, fetchImpl);
  const rates = await get<{ rates?: { TON?: { prices?: { USD?: number }; diff_24h?: { USD?: string } } } }>(
    '/rates?tokens=ton&currencies=usd',
    fetchImpl,
  ).catch(() => null);
  const jettons = await get<{ balances?: JettonBalance[] }>(`/accounts/${id}/jettons?currencies=usd`, fetchImpl);

  const chain = getChainInfo('ton');
  const price = rates?.rates?.TON?.prices?.USD ?? 0;
  const balance = units(account.balance ?? 0, NATIVE_DECIMALS);
  const tokens: NormalizedToken[] = [{
    symbol: chain?.symbol ?? 'GRAM',
    name: 'Gram',
    address: '',
    decimals: NATIVE_DECIMALS,
    balance,
    priceUsd: price,
    usdValue: balance * price,
    priceChange24h: parsePercent(rates?.rates?.TON?.diff_24h?.USD),
    logoUrl: chain?.nativeLogoUrl ?? null,
    isNative: true,
    chainName: 'ton',
    isSpam: false,
    coingeckoId: TON_COINGECKO_ID,
  }];
  for (const row of jettons.balances ?? []) {
    const decimals = row.jetton.decimals ?? 9;
    const amount = units(row.balance, decimals);
    if (amount <= 0) continue;
    const jettonPrice = row.price?.prices?.USD ?? 0;
    tokens.push({
      symbol: row.jetton.symbol?.trim() || '?',
      name: row.jetton.name?.trim() || row.jetton.symbol?.trim() || 'Jetton',
      address: friendlyTonAddress(row.jetton.address, true),
      decimals,
      balance: amount,
      priceUsd: jettonPrice,
      usdValue: amount * jettonPrice,
      priceChange24h: parsePercent(row.price?.diff_24h?.USD),
      logoUrl: row.jetton.image ?? null,
      isNative: false,
      chainName: 'ton',
      // Anyone can mint a jetton named like a real one: only TonAPI's whitelist counts as genuine.
      isSpam: row.jetton.verification !== 'whitelist' || row.wallet_address?.is_scam === true,
    });
  }
  return tokens;
}

// ─── History ────────────────────────────────────────────────────────────────

interface AccountRef { address: string; is_scam?: boolean }
interface TonAction {
  type: string;
  status?: string;
  TonTransfer?: { sender: AccountRef; recipient: AccountRef; amount: number | string };
  JettonTransfer?: {
    sender?: AccountRef | null;
    recipient?: AccountRef | null;
    amount: string;
    jetton: JettonInfo;
  };
  JettonSwap?: {
    amount_in?: string;
    amount_out?: string;
    ton_in?: number | string;
    ton_out?: number | string;
    jetton_master_in?: JettonInfo | null;
    jetton_master_out?: JettonInfo | null;
  };
  simple_preview?: { name?: string; description?: string };
}
interface TonEvent {
  event_id: string;
  timestamp: number;
  lt?: number;
  is_scam?: boolean;
  in_progress?: boolean;
  actions: TonAction[];
}

export interface TonTransaction {
  id: string;
  hash: string;
  chainName: 'ton';
  type: 'send' | 'receive' | 'swap' | 'contract';
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenAddresses: string[];
  fromAddress: string | null;
  toAddress: string | null;
  value: number | null;
  sentValue: number | null;
  usdValue: null;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  blockNumber: string | null;
  logoUrl: string | null;
  swapLogoUrl: string | null;
  swapOutSymbol: string | null;
  swapInSymbol: string | null;
  swapOutTokenAddress: string | null;
  swapInTokenAddress: string | null;
  isScam: boolean;
}

const NATIVE_SYMBOL = 'GRAM';

/** One history row per event: a swap wins, else the first transfer that touches the wallet. */
export function tonEventToTransaction(event: TonEvent, wallet: string): TonTransaction | null {
  const own = parseTonAddress(wallet);
  if (!own) return null;
  const self = rawTonAddress(own);
  const isSelf = (ref?: AccountRef | null) => {
    const parsed = ref ? parseTonAddress(ref.address) : null;
    return !!parsed && rawTonAddress(parsed) === self;
  };
  const friendly = (ref?: AccountRef | null) => (ref ? friendlyTonAddress(ref.address, false) : null);
  const failed = event.actions.every((a) => a.status && a.status !== 'ok');
  const base = {
    id: event.event_id,
    hash: event.event_id,
    chainName: 'ton' as const,
    usdValue: null,
    status: event.in_progress ? ('pending' as const) : failed ? ('failed' as const) : ('success' as const),
    timestamp: new Date(event.timestamp * 1000).toISOString(),
    blockNumber: event.lt != null ? String(event.lt) : null,
    swapLogoUrl: null,
    swapOutSymbol: null,
    swapInSymbol: null,
    swapOutTokenAddress: null,
    swapInTokenAddress: null,
    isScam: event.is_scam === true,
  };

  const swap = event.actions.find((a) => a.type === 'JettonSwap' && a.JettonSwap)?.JettonSwap;
  if (swap) {
    const outJetton = swap.jetton_master_in ?? null;
    const inJetton = swap.jetton_master_out ?? null;
    const outSymbol = outJetton?.symbol ?? NATIVE_SYMBOL;
    const inSymbol = inJetton?.symbol ?? NATIVE_SYMBOL;
    const sent = outJetton ? units(swap.amount_in ?? 0, outJetton.decimals ?? 9) : units(swap.ton_in ?? 0, NATIVE_DECIMALS);
    const received = inJetton ? units(swap.amount_out ?? 0, inJetton.decimals ?? 9) : units(swap.ton_out ?? 0, NATIVE_DECIMALS);
    const outAddress = outJetton ? friendlyTonAddress(outJetton.address, true) : null;
    const inAddress = inJetton ? friendlyTonAddress(inJetton.address, true) : null;
    return {
      ...base,
      type: 'swap',
      tokenSymbol: `${outSymbol} → ${inSymbol}`,
      tokenName: `${outSymbol} → ${inSymbol}`,
      tokenAddresses: [outAddress, inAddress].filter((a): a is string => !!a),
      fromAddress: wallet,
      toAddress: null,
      value: received,
      sentValue: sent,
      logoUrl: outJetton?.image ?? getChainInfo('ton')?.nativeLogoUrl ?? null,
      swapLogoUrl: inJetton?.image ?? getChainInfo('ton')?.nativeLogoUrl ?? null,
      swapOutSymbol: outSymbol,
      swapInSymbol: inSymbol,
      swapOutTokenAddress: outAddress,
      swapInTokenAddress: inAddress,
    };
  }

  for (const action of event.actions) {
    const ton = action.type === 'TonTransfer' ? action.TonTransfer : undefined;
    if (ton && (isSelf(ton.sender) || isSelf(ton.recipient))) {
      const outgoing = isSelf(ton.sender);
      return {
        ...base,
        type: outgoing ? 'send' : 'receive',
        tokenSymbol: NATIVE_SYMBOL,
        tokenName: 'Gram',
        tokenAddresses: [],
        fromAddress: friendly(ton.sender),
        toAddress: friendly(ton.recipient),
        value: units(ton.amount, NATIVE_DECIMALS),
        sentValue: null,
        logoUrl: getChainInfo('ton')?.nativeLogoUrl ?? null,
      };
    }
    const jetton = action.type === 'JettonTransfer' ? action.JettonTransfer : undefined;
    if (jetton && (isSelf(jetton.sender) || isSelf(jetton.recipient))) {
      const outgoing = isSelf(jetton.sender);
      const address = friendlyTonAddress(jetton.jetton.address, true);
      return {
        ...base,
        type: outgoing ? 'send' : 'receive',
        tokenSymbol: jetton.jetton.symbol ?? null,
        tokenName: jetton.jetton.name ?? jetton.jetton.symbol ?? null,
        tokenAddresses: [address],
        fromAddress: friendly(jetton.sender),
        toAddress: friendly(jetton.recipient),
        value: units(jetton.amount, jetton.jetton.decimals ?? 9),
        sentValue: null,
        logoUrl: jetton.jetton.image ?? null,
        // A fake jetton sent to many wallets is the usual TON spam.
        isScam: base.isScam || jetton.jetton.verification === 'blacklist',
      };
    }
  }

  const first = event.actions[0];
  if (!first) return null;
  return {
    ...base,
    type: 'contract',
    tokenSymbol: first.simple_preview?.name ?? first.type,
    tokenName: first.simple_preview?.description ?? first.type,
    tokenAddresses: [],
    fromAddress: wallet,
    toAddress: null,
    value: null,
    sentValue: null,
    logoUrl: null,
  };
}

/** A page of history, newest first; the cursor is the logical time TonAPI returns as `next_from`. */
export async function fetchTonTransactionsPage(
  wallet: string,
  cursor: string | undefined,
  pageSize: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ transactions: TonTransaction[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ limit: String(Math.min(Math.max(pageSize, 1), 100)) });
  if (cursor) params.set('before_lt', cursor);
  const body = await get<{ events?: TonEvent[]; next_from?: number }>(
    `/accounts/${encodeURIComponent(wallet)}/events?${params}`,
    fetchImpl,
  );
  const transactions = (body.events ?? [])
    .map((event) => tonEventToTransaction(event, wallet))
    .filter((tx): tx is TonTransaction => tx !== null);
  return {
    transactions,
    nextPageToken: body.next_from && (body.events?.length ?? 0) >= pageSize ? String(body.next_from) : undefined,
  };
}
