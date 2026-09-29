import axios from 'axios';
import { z } from 'zod';
import type { NormalizedToken, NormalizedTransaction } from './token-types';

const INFO = 'https://api.hyperliquid.xyz/info';
const SCOUT = 'https://www.hyperscan.com/api/v2';
const addressPattern = /^0x[\da-f]{40}$/i;

async function info(body: Record<string, unknown>): Promise<unknown> {
  const { data } = await axios.post(INFO, body, { timeout: 12_000, headers: { 'Content-Type': 'application/json' } });
  return data;
}

const spotState = z.object({ balances: z.array(z.object({
  coin: z.string(), token: z.number().int(), total: z.string(),
})) });
const spotMeta = z.object({ tokens: z.array(z.object({
  index: z.number().int(), name: z.string(), fullName: z.string().nullable().optional(),
  tokenId: z.string(), weiDecimals: z.number().int(),
})), universe: z.array(z.object({ index: z.number().int(), tokens: z.array(z.number().int()) })) });
const spotContext = z.object({ markPx: z.string().nullable().optional(), midPx: z.string().nullable().optional(), prevDayPx: z.string().nullable().optional() });
const perpState = z.object({ marginSummary: z.object({ accountValue: z.string() }) });

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** HyperCore spot is authoritative for unified/portfolio accounts; perp equity is
 * added only for the classic account mode, where collateral is separate. */
export async function fetchHyperCoreBalances(address: string): Promise<NormalizedToken[]> {
  if (!addressPattern.test(address)) throw new Error('Invalid Hyperliquid address');
  const [stateRaw, metaRaw, modeRaw] = await Promise.all([
    info({ type: 'spotClearinghouseState', user: address }),
    info({ type: 'spotMetaAndAssetCtxs' }),
    info({ type: 'userAbstraction', user: address }),
  ]);
  const state = spotState.parse(stateRaw);
  const [meta, contexts] = z.tuple([spotMeta, z.array(spotContext)]).parse(metaRaw);
  const mode = z.string().parse(modeRaw);
  const prices = new Map<number, { price: number; change: number }>();
  for (let i = 0; i < meta.universe.length; i++) {
    const pair = meta.universe[i]!;
    if (pair.tokens.length !== 2 || pair.tokens[1] !== 0) continue;
    const ctx = contexts[i];
    const price = finite(ctx?.markPx ?? ctx?.midPx);
    const previous = finite(ctx?.prevDayPx);
    if (price > 0) prices.set(pair.tokens[0]!, { price, change: previous > 0 ? (price / previous - 1) * 100 : 0 });
  }
  const tokenByIndex = new Map(meta.tokens.map((token) => [token.index, token]));
  const balances: NormalizedToken[] = state.balances.flatMap((entry) => {
    const balance = finite(entry.total);
    if (balance <= 0) return [];
    const token = tokenByIndex.get(entry.token);
    if (!token) return [];
    const quote = entry.token === 0 ? { price: 1, change: 0 } : prices.get(entry.token);
    const priceUsd = quote?.price ?? 0;
    return [{
      symbol: token.name, name: token.fullName || token.name,
      // HyperCore token IDs are not EVM contract addresses.
      address: token.tokenId.toLowerCase(), decimals: token.weiDecimals,
      balance, priceUsd, usdValue: balance * priceUsd,
      priceChange24h: quote?.change ?? 0, logoUrl: null,
      isNative: false, chainName: 'hypercore', isSpam: false,
    }];
  });
  if (mode !== 'unifiedAccount' && mode !== 'portfolioMargin') {
    const perp = perpState.parse(await info({ type: 'clearinghouseState', user: address }));
    const equity = finite(perp.marginSummary.accountValue);
    if (equity > 0) balances.push({
      symbol: 'USD', name: 'Perpetuals equity (USD)', address: 'perp-equity', decimals: 2,
      balance: equity, priceUsd: 1, usdValue: equity, priceChange24h: 0,
      logoUrl: null, isNative: false, chainName: 'hypercore-perps', isSpam: false,
    });
  }
  return balances;
}

const scoutToken = z.object({ address_hash: z.string(), symbol: z.string().nullable(), name: z.string().nullable(),
  decimals: z.string().nullable(), exchange_rate: z.string().nullable(), icon_url: z.string().nullable(), type: z.string() });
const cursor = z.record(z.union([z.string().max(256), z.number(), z.boolean()]));
async function scout(path: string, params?: Record<string, unknown>): Promise<unknown> {
  const { data } = await axios.get(`${SCOUT}${path}`, { params, timeout: 12_000 });
  return data;
}
function units(raw: string, decimals: number): number {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid HyperEVM amount');
  const scale = 10n ** BigInt(decimals);
  return Number(BigInt(raw) / scale) + Number(BigInt(raw) % scale) / 10 ** decimals;
}

export async function fetchHyperEvmBalances(address: string): Promise<NormalizedToken[]> {
  if (!addressPattern.test(address)) throw new Error('Invalid Hyperliquid address');
  const path = `/addresses/${address}`;
  const account = z.object({ coin_balance: z.string().nullable(), exchange_rate: z.string().nullable() }).parse(await scout(path));
  if (account.coin_balance === null) throw new Error('HyperEVM address is not indexed');
  const native = units(account.coin_balance, 18);
  const priceUsd = finite(account.exchange_rate);
  const balances: NormalizedToken[] = native > 0 ? [{
    symbol: 'HYPE', name: 'Hyperliquid', address: '', decimals: 18,
    balance: native, priceUsd, usdValue: native * priceUsd, priceChange24h: 0,
    logoUrl: null, isNative: true, chainName: 'hyperevm', isSpam: false,
  }] : [];
  let page: z.infer<typeof cursor> | null = null;
  const seen = new Set<string>();
  for (let n = 0; n < 20; n++) {
    const result = z.object({ items: z.array(z.object({ value: z.string(), token: scoutToken })), next_page_params: cursor.nullable() })
      .parse(await scout(`${path}/tokens`, { ...page, type: 'ERC-20' }));
    for (const item of result.items) {
      const token = item.token;
      if (token.type !== 'ERC-20' || !addressPattern.test(token.address_hash) || token.decimals === null) continue;
      const contract = token.address_hash.toLowerCase();
      if (seen.has(contract)) continue;
      seen.add(contract);
      const decimals = Number(token.decimals);
      const balance = units(item.value, decimals);
      if (balance <= 0) continue;
      const priceUsd = finite(token.exchange_rate);
      balances.push({ symbol: token.symbol || contract.slice(0, 8), name: token.name || token.symbol || contract,
        address: contract, decimals, balance, priceUsd, usdValue: balance * priceUsd,
        priceChange24h: 0, logoUrl: token.icon_url, isNative: false, chainName: 'hyperevm', isSpam: false });
    }
    page = result.next_page_params;
    if (!page) return balances;
  }
  throw new Error('HyperEVM token pagination limit reached');
}

const explorerAddress = z.object({ hash: z.string() });
const explorerTx = z.object({ hash: z.string(), from: explorerAddress, to: explorerAddress.nullable(),
  timestamp: z.string().nullable(), value: z.string(), status: z.string().nullable(), block_number: z.number().nullable() });
const explorerTransfer = z.object({ transaction_hash: z.string(), log_index: z.number(),
  from: explorerAddress, to: explorerAddress.nullable(), timestamp: z.string().nullable(),
  token: scoutToken, total: z.object({ value: z.string(), decimals: z.string() }), block_number: z.number().nullable() });
const evmCursor = z.object({ native: cursor.nullable(), transfers: cursor.nullable() });
export function parseHyperEvmCursor(value: string) {
  if (value.length > 4096) throw new Error('Invalid HyperEVM cursor');
  return evmCursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
}
export async function fetchHyperEvmTransactions(address: string, pageToken?: string) {
  if (!addressPattern.test(address)) throw new Error('Invalid Hyperliquid address');
  const page = pageToken ? parseHyperEvmCursor(pageToken) : undefined;
  const path = `/addresses/${address}`;
  const [native, transfers] = await Promise.all([
    page?.native === null ? { items: [], next_page_params: null } :
      scout(`${path}/transactions`, page?.native ?? {}).then((raw) => z.object({ items: z.array(explorerTx), next_page_params: cursor.nullable() }).parse(raw)),
    page?.transfers === null ? { items: [], next_page_params: null } :
      scout(`${path}/token-transfers`, { ...page?.transfers, type: 'ERC-20' })
        .then((raw) => z.object({ items: z.array(explorerTransfer), next_page_params: cursor.nullable() }).parse(raw)),
  ]);
  const wallet = address.toLowerCase();
  const transactions: (NormalizedTransaction & { id: string })[] = [];
  for (const tx of native.items) {
    if (!tx.timestamp) continue;
    const value = units(tx.value, 18);
    if (value <= 0) continue;
    transactions.push({ id: `${tx.hash}:native`, hash: tx.hash, chainName: 'hyperevm',
      type: tx.from.hash.toLowerCase() === wallet ? 'send' : 'receive',
      tokenSymbol: 'HYPE', tokenName: 'Hyperliquid', fromAddress: tx.from.hash,
      toAddress: tx.to?.hash ?? null, value, usdValue: null, gasUsed: null,
      status: tx.status === 'ok' ? 'success' : 'failed',
      blockNumber: tx.block_number === null ? null : BigInt(tx.block_number), timestamp: new Date(tx.timestamp) });
  }
  for (const tx of transfers.items) {
    if (!tx.timestamp || tx.token.type !== 'ERC-20' || !addressPattern.test(tx.token.address_hash)) continue;
    transactions.push({ id: `${tx.transaction_hash}:${tx.log_index}`, hash: tx.transaction_hash,
      chainName: 'hyperevm', type: tx.from.hash.toLowerCase() === wallet ? 'send' : 'receive',
      tokenSymbol: tx.token.symbol, tokenName: tx.token.name, tokenAddresses: [tx.token.address_hash.toLowerCase()],
      fromAddress: tx.from.hash, toAddress: tx.to?.hash ?? null,
      value: units(tx.total.value, Number(tx.total.decimals)), usdValue: null, gasUsed: null,
      status: 'success', blockNumber: tx.block_number === null ? null : BigInt(tx.block_number), timestamp: new Date(tx.timestamp) });
  }
  const next = { native: native.next_page_params, transfers: transfers.next_page_params };
  return { transactions: transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    nextPageToken: next.native || next.transfers ? Buffer.from(JSON.stringify(next)).toString('base64url') : undefined };
}

const fill = z.object({ hash: z.string(), tid: z.number(), coin: z.string(), side: z.string(),
  sz: z.string(), px: z.string(), time: z.number() });
const ledger = z.object({ hash: z.string(), time: z.number(), delta: z.object({ type: z.string() }).passthrough() });
const pairMeta = z.object({ tokens: z.array(z.object({ index: z.number(), name: z.string(), tokenId: z.string().optional() })),
  universe: z.array(z.object({ index: z.number(), tokens: z.array(z.number()) })) });

async function recentLedger(address: string): Promise<z.infer<typeof ledger>[]> {
  const endTime = Date.now();
  let startTime = endTime - 30 * 86_400_000;
  // The info endpoint caps ranged responses at 500. Narrow the window towards
  // the present if a busy account fills that cap, so newest activity is shown.
  for (let attempt = 0; attempt < 16; attempt++) {
    const entries = z.array(ledger).parse(await info({
      type: 'userNonFundingLedgerUpdates', user: address, startTime, endTime,
    }));
    if (entries.length < 500 || endTime - startTime <= 1) return entries;
    startTime = Math.floor((startTime + endTime) / 2);
  }
  throw new Error('HyperCore ledger window is too dense');
}

export async function fetchHyperCoreTransactions(address: string): Promise<(NormalizedTransaction & { id: string })[]> {
  if (!addressPattern.test(address)) throw new Error('Invalid Hyperliquid address');
  const [fillsRaw, ledgerRaw, metaRaw] = await Promise.all([
    info({ type: 'userFills', user: address }),
    recentLedger(address),
    info({ type: 'spotMeta' }),
  ]);
  const fills = z.array(fill).parse(fillsRaw);
  const updates = ledgerRaw;
  const meta = pairMeta.parse(metaRaw);
  const names = new Map(meta.tokens.map((token) => [token.index, token.name]));
  const namesById = new Map(meta.tokens.filter((token) => token.tokenId).map((token) => [token.tokenId!.toLowerCase(), token.name]));
  const pairs = new Map(meta.universe.map((pair) => [pair.index, pair.tokens.map((idx) => names.get(idx) ?? '?').join('/')]));
  const transactions: (NormalizedTransaction & { id: string })[] = fills.map((item) => ({
    hash: item.hash, chainName: 'hypercore', type: 'swap',
    tokenSymbol: item.coin.startsWith('@') ? pairs.get(Number(item.coin.slice(1))) ?? item.coin : `${item.coin} perp`,
    tokenName: item.side === 'B' ? 'Buy' : 'Sell', fromAddress: address, toAddress: null,
    value: finite(item.sz), usdValue: finite(item.sz) * finite(item.px), gasUsed: null,
    status: 'success', blockNumber: null, timestamp: new Date(item.time),
    id: `${item.hash}:fill:${item.tid}`,
  }));
  for (const [index, item] of updates.entries()) {
    const d = item.delta;
    const kind = d.type;
    const destination = typeof d.destination === 'string' ? d.destination : null;
    const isOutgoing = kind === 'withdraw' ||
      ((kind === 'spotTransfer' || kind === 'internalTransfer' || kind === 'subAccountTransfer')
        && destination?.toLowerCase() !== address.toLowerCase());
    const amount = finite(d.amount ?? d.usdc);
    if (amount <= 0) continue;
    transactions.push({
      hash: item.hash, chainName: 'hypercore', type: kind === 'accountClassTransfer' ? 'transfer' : isOutgoing ? 'send' : 'receive',
      tokenSymbol: typeof d.token === 'string' ? namesById.get(d.token.toLowerCase()) ?? d.token : 'USDC', tokenName: kind,
      fromAddress: isOutgoing ? address : null, toAddress: destination,
      value: amount, usdValue: null, gasUsed: null, status: 'success', blockNumber: null,
      timestamp: new Date(item.time), id: `${item.hash}:ledger:${item.time}:${kind}:${index}`,
    });
  }
  return transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
