import axios from 'axios';
import { z } from 'zod';
import type { NormalizedToken, NormalizedTransaction } from './token-types';

const INFO = 'https://api.hyperliquid.xyz/info';
const HYPEREVM_RPC = 'https://rpc.hyperliquid.xyz/evm';
const ETHERSCAN = 'https://api.etherscan.io/v2/api';
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

const scanTransfer = z.object({ hash: z.string(), timeStamp: z.string(), from: z.string(), to: z.string(),
  contractAddress: z.string(), value: z.string(), tokenName: z.string(), tokenSymbol: z.string(),
  tokenDecimal: z.string(), blockNumber: z.string(), transactionIndex: z.string().optional(),
  logIndex: z.string().optional() });
const scanTransaction = z.object({ hash: z.string(), timeStamp: z.string(), from: z.string(), to: z.string(),
  value: z.string(), blockNumber: z.string(), isError: z.string() });
const SCAN_PAGE_SIZE = 1000;
const MAX_SCAN_PAGES = 5;

async function scan(action: string, address: string, page: number, offset = SCAN_PAGE_SIZE): Promise<unknown[]> {
  const key = process.env.ETHERSCAN_API_KEY?.trim();
  if (!key) throw new Error('ETHERSCAN_API_KEY is not configured');
  const { data } = await axios.get(ETHERSCAN, { timeout: 10_000, params: {
    chainid: 999, module: 'account', action, address, startblock: 0, endblock: 999999999,
    page, offset, sort: 'desc', apikey: key,
  } });
  const response = z.object({ status: z.string(), message: z.string(), result: z.unknown() }).parse(data);
  if (response.status === '0' && /no transactions found/i.test(response.message) &&
      Array.isArray(response.result) && response.result.length === 0) return [];
  if (response.status !== '1') throw new Error(`Etherscan ${action} failed (${response.message})`);
  return z.array(z.unknown()).parse(response.result);
}

async function evmRpc(method: string, params: unknown[]): Promise<string> {
  const { data } = await axios.post(HYPEREVM_RPC, { jsonrpc: '2.0', id: 1, method, params }, { timeout: 10_000 });
  const response = z.object({ result: z.string().optional(), error: z.object({ code: z.number() }).optional() }).parse(data);
  if (!response.result || response.error) throw new Error(`HyperEVM RPC ${method} failed`);
  return response.result;
}

async function tokenTransfers(address: string): Promise<z.infer<typeof scanTransfer>[]> {
  const transfers: z.infer<typeof scanTransfer>[] = [];
  for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
    const rows = z.array(scanTransfer).parse(await scan('tokentx', address, page));
    transfers.push(...rows);
    if (rows.length < SCAN_PAGE_SIZE) return transfers;
  }
  // Never silently discard a token from a very active wallet.
  throw new Error('HyperEVM transfer history exceeds scan page limit');
}
function units(raw: string, decimals: number): number {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid HyperEVM amount');
  const scale = 10n ** BigInt(decimals);
  return Number(BigInt(raw) / scale) + Number(BigInt(raw) % scale) / 10 ** decimals;
}
function hexUnits(raw: string, decimals: number): number {
  if (!/^0x[\da-f]*$/i.test(raw)) throw new Error('Invalid HyperEVM RPC amount');
  return units(BigInt(raw === '0x' ? '0x0' : raw).toString(), decimals);
}

export async function fetchHyperEvmBalances(address: string): Promise<NormalizedToken[]> {
  if (!addressPattern.test(address)) throw new Error('Invalid Hyperliquid address');
  if (!process.env.ETHERSCAN_API_KEY?.trim()) throw new Error('ETHERSCAN_API_KEY is not configured');
  // Native HYPE comes from the chain itself; Etherscan transfers discover ERC-20
  // contracts, then the chain supplies their *current* balances.
  const [nativeHex, transfers] = await Promise.all([
    evmRpc('eth_getBalance', [address, 'latest']), tokenTransfers(address),
  ]);
  const native = hexUnits(nativeHex, 18);
  const balances: NormalizedToken[] = native > 0 ? [{
    symbol: 'HYPE', name: 'Hyperliquid', address: '', decimals: 18,
    balance: native, priceUsd: 0, usdValue: 0, priceChange24h: 0,
    logoUrl: null, isNative: true, chainName: 'hyperevm', isSpam: false,
  }] : [];
  const tokens = new Map<string, z.infer<typeof scanTransfer>>();
  for (const transfer of transfers) {
    const decimals = Number(transfer.tokenDecimal);
    if (addressPattern.test(transfer.contractAddress) && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36) {
      tokens.set(transfer.contractAddress.toLowerCase(), transfer);
    }
  }
  const entries = Array.from(tokens.entries());
  for (let i = 0; i < entries.length; i += 4) {
    const chunk = entries.slice(i, i + 4);
    const amounts = await Promise.all(chunk.map(([contract]) =>
      evmRpc('eth_call', [{ to: contract, data: `0x70a08231${address.slice(2).padStart(64, '0')}` }, 'latest'])));
    for (let j = 0; j < chunk.length; j++) {
      const [contract, token] = chunk[j]!;
      const decimals = Number(token.tokenDecimal);
      const balance = hexUnits(amounts[j]!, decimals);
      if (balance <= 0) continue;
      balances.push({ symbol: token.tokenSymbol || contract.slice(0, 8), name: token.tokenName || token.tokenSymbol || contract,
        address: contract, decimals, balance, priceUsd: 0, usdValue: 0,
        priceChange24h: 0, logoUrl: null, isNative: false, chainName: 'hyperevm', isSpam: false });
    }
  }
  return balances;
}

const evmCursor = z.object({ native: z.number().int().min(1).max(1000).nullable(),
  transfers: z.number().int().min(1).max(1000).nullable() });
export function parseHyperEvmCursor(value: string) {
  if (value.length > 128) throw new Error('Invalid HyperEVM cursor');
  return evmCursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
}
export async function fetchHyperEvmTransactions(address: string, pageToken?: string) {
  if (!addressPattern.test(address)) throw new Error('Invalid Hyperliquid address');
  const page = pageToken ? parseHyperEvmCursor(pageToken) : undefined;
  const pageSize = 100;
  const [native, transfers] = await Promise.all([
    page?.native === null ? [] : scan('txlist', address, page?.native ?? 1, pageSize).then((rows) => z.array(scanTransaction).parse(rows)),
    page?.transfers === null ? [] : scan('tokentx', address, page?.transfers ?? 1, pageSize).then((rows) => z.array(scanTransfer).parse(rows)),
  ]);
  const wallet = address.toLowerCase();
  const transactions: (NormalizedTransaction & { id: string })[] = [];
  for (const tx of native) {
    const value = units(tx.value, 18);
    if (value <= 0) continue;
    transactions.push({ id: `${tx.hash}:native`, hash: tx.hash, chainName: 'hyperevm',
      type: tx.from.toLowerCase() === wallet ? 'send' : 'receive',
      tokenSymbol: 'HYPE', tokenName: 'Hyperliquid', fromAddress: tx.from,
      toAddress: tx.to || null, value, usdValue: null, gasUsed: null,
      status: tx.isError === '0' ? 'success' : 'failed',
      blockNumber: BigInt(tx.blockNumber), timestamp: new Date(Number(tx.timeStamp) * 1000) });
  }
  for (const [index, tx] of transfers.entries()) {
    if (!addressPattern.test(tx.contractAddress)) continue;
    transactions.push({ id: `${tx.hash}:${tx.logIndex ?? `${tx.contractAddress}:${index}`}`, hash: tx.hash,
      chainName: 'hyperevm', type: tx.from.toLowerCase() === wallet ? 'send' : 'receive',
      tokenSymbol: tx.tokenSymbol, tokenName: tx.tokenName, tokenAddresses: [tx.contractAddress.toLowerCase()],
      fromAddress: tx.from, toAddress: tx.to || null,
      value: units(tx.value, Number(tx.tokenDecimal)), usdValue: null, gasUsed: null,
      status: 'success', blockNumber: BigInt(tx.blockNumber), timestamp: new Date(Number(tx.timeStamp) * 1000) });
  }
  const next = {
    native: native.length === pageSize ? (page?.native ?? 1) + 1 : null,
    transfers: transfers.length === pageSize ? (page?.transfers ?? 1) + 1 : null,
  };
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
