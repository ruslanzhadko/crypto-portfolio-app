import axios from 'axios';
import { z } from 'zod';
import type { NormalizedToken, NormalizedTransaction } from './moralis';
import { getChainInfo } from '@/lib/utils/networks';

// Official mainnet explorer: https://docs.robinhood.com/chain/connecting/
const BASE = 'https://robinhoodchain.blockscout.com/api/v2';
const cursorSchema = z.record(z.union([z.string().max(256), z.number(), z.boolean()]));
const tokenSchema = z.object({
  address_hash: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  symbol: z.string().nullable(), name: z.string().nullable(),
  decimals: z.string().nullable(), exchange_rate: z.string().nullable(),
  icon_url: z.string().nullable(), type: z.string(),
});
const balancePageSchema = z.object({
  items: z.array(z.object({ value: z.string(), token: tokenSchema })),
  next_page_params: cursorSchema.nullable(),
});

async function get(path: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
  const key = process.env.ROBINHOOD_BLOCKSCOUT_API_KEY;
  const base = key ? 'https://api.blockscout.com/4663/api/v2' : BASE;
  const response = await axios.get(`${base}${path}`, {
    params: { ...params, ...(key ? { apikey: key } : {}) }, timeout: 10_000, signal,
  });
  return response.data;
}

function amount(raw: string, decimals: number): number {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Invalid Robinhood token amount');
  }
  const units = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const value = Number(units / scale) + Number(units % scale) / 10 ** decimals;
  if (!Number.isFinite(value)) throw new Error('Robinhood token amount overflow');
  return value;
}

function price(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function fetchRobinhoodBalances(address: string): Promise<NormalizedToken[]> {
  const signal = AbortSignal.timeout(20_000);
  const path = `/addresses/${address}`;
  const account = z.object({ coin_balance: z.string().nullable(), exchange_rate: z.string().nullable() })
    .parse(await get(path, {}, signal));
  // A missing indexed balance is not a confirmed zero balance.
  if (account.coin_balance === null) throw new Error('Robinhood balance is not indexed yet');
  const balance = amount(account.coin_balance, 18);
  const priceUsd = price(account.exchange_rate);
  const tokens: NormalizedToken[] = balance > 0 ? [{
    symbol: 'ETH', name: 'Ethereum', address: '', decimals: 18, balance,
    priceUsd, usdValue: balance * priceUsd, priceChange24h: 0,
    logoUrl: getChainInfo('robinhood')!.nativeLogoUrl,
    isNative: true, chainName: 'robinhood', isSpam: false,
  }] : [];
  let cursor: z.infer<typeof cursorSchema> | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const result = balancePageSchema.parse(await get(`${path}/tokens`, { ...cursor, type: 'ERC-20' }, signal));
    for (const item of result.items) {
      if (item.token.type !== 'ERC-20' || item.token.decimals === null) continue;
      const address = item.token.address_hash.toLowerCase();
      if (seen.has(address)) continue;
      seen.add(address);
      const decimals = Number(item.token.decimals);
      const balance = amount(item.value, decimals);
      if (balance <= 0) continue;
      const priceUsd = price(item.token.exchange_rate);
      tokens.push({
        symbol: item.token.symbol || address.slice(0, 8),
        name: item.token.name || item.token.symbol || address,
        address, decimals, balance, priceUsd, usdValue: balance * priceUsd,
        priceChange24h: 0, logoUrl: item.token.icon_url,
        isNative: false, chainName: 'robinhood', isSpam: false,
      });
    }
    cursor = result.next_page_params;
    if (!cursor) return tokens;
  }
  // Never replace stored balances with a truncated response.
  throw new Error('Robinhood token pagination limit reached');
}

const addressSchema = z.object({ hash: z.string() });
const commonTxSchema = z.object({
  from: addressSchema, to: addressSchema.nullable(), timestamp: z.string().nullable(),
  block_number: z.number().nullable(),
});
const nativeTxSchema = commonTxSchema.extend({
  hash: z.string(), value: z.string(), status: z.string().nullable(),
});
const transferSchema = commonTxSchema.extend({
  transaction_hash: z.string(), log_index: z.number(), token: tokenSchema,
  total: z.object({ value: z.string(), decimals: z.string() }),
});
const historyCursorSchema = z.object({
  native: cursorSchema.nullable(), transfers: cursorSchema.nullable(),
});
export function parseRobinhoodCursor(cursor: string) {
  if (cursor.length > 4096) throw new Error('Invalid Robinhood cursor');
  return historyCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
}

export async function fetchRobinhoodTransactions(address: string, pageToken?: string) {
  const cursor = pageToken ? parseRobinhoodCursor(pageToken) : undefined;
  const path = `/addresses/${address}`;
  const [native, transfers] = await Promise.all([
    cursor?.native === null ? { items: [], next_page_params: null } :
      get(`${path}/transactions`, cursor?.native ?? {}).then((data) => z.object({
        items: z.array(nativeTxSchema), next_page_params: cursorSchema.nullable(),
      }).parse(data)),
    cursor?.transfers === null ? { items: [], next_page_params: null } :
      get(`${path}/token-transfers`, { ...cursor?.transfers, type: 'ERC-20' }).then((data) => z.object({
        items: z.array(transferSchema), next_page_params: cursorSchema.nullable(),
      }).parse(data)),
  ]);
  const transactions: Array<NormalizedTransaction & { id: string }> = [];
  const wallet = address.toLowerCase();
  for (const tx of native.items) {
    if (!tx.timestamp) continue;
    const value = amount(tx.value, 18);
    transactions.push({
      id: `${tx.hash}:native`, hash: tx.hash, chainName: 'robinhood',
      type: value === 0 ? 'contract' : tx.from.hash.toLowerCase() === wallet ? 'send' : 'receive',
      tokenSymbol: 'ETH', tokenName: 'Ethereum', fromAddress: tx.from.hash,
      toAddress: tx.to?.hash ?? null, value, usdValue: null, gasUsed: null,
      status: tx.status === 'ok' ? 'success' : 'failed',
      blockNumber: tx.block_number === null ? null : BigInt(tx.block_number), timestamp: new Date(tx.timestamp),
    });
  }
  for (const tx of transfers.items) {
    if (!tx.timestamp || tx.token.type !== 'ERC-20') continue;
    transactions.push({
      id: `${tx.transaction_hash}:${tx.log_index}`, hash: tx.transaction_hash, chainName: 'robinhood',
      type: tx.from.hash.toLowerCase() === wallet ? 'send' : 'receive',
      tokenSymbol: tx.token.symbol, tokenName: tx.token.name, fromAddress: tx.from.hash,
      toAddress: tx.to?.hash ?? null, value: amount(tx.total.value, Number(tx.total.decimals)),
      usdValue: null, gasUsed: null, status: 'success',
      blockNumber: tx.block_number === null ? null : BigInt(tx.block_number), timestamp: new Date(tx.timestamp),
    });
  }
  const next = { native: native.next_page_params, transfers: transfers.next_page_params };
  return {
    // Keep every event from both provider pages; truncating would skip transfers.
    transactions: transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    nextPageToken: next.native || next.transfers ? Buffer.from(JSON.stringify(next)).toString('base64url') : undefined,
  };
}
