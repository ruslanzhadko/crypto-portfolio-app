import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { fetchTransactionsPage } from '@/lib/services/ankr';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ─── In-memory cache (dev / single-instance) ────────────────────────────────
// Ключ: walletAddress::pageToken::pageSize
// TTL: 5 хвилин — захист від rate limit Ankr Freemium при навігації туди-сюди
interface CacheEntry { payload: object; expiry: number }
const txCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  const e = txCache.get(key);
  if (!e) return null;
  if (e.expiry < Date.now()) { txCache.delete(key); return null; }
  return e.payload as T;
}
function cacheSet(key: string, payload: object): void {
  txCache.set(key, { payload, expiry: Date.now() + CACHE_TTL });
}
// ────────────────────────────────────────────────────────────────────────────

function parseSwapSymbols(tokenSymbol: string): string[] {
  if (tokenSymbol.includes('→')) {
    return tokenSymbol.split('→').map((s) => s.trim()).filter(Boolean);
  }
  return [tokenSymbol];
}

// ─── Solana transactions via public JSON-RPC (batch) ────────────────────────
// 1. getSignaturesForAddress  → список підписів
// 2. Batch getTransaction      → деталі всіх транзакцій за ОДИН HTTP запит
// 3. Diff pre/postTokenBalances → визначаємо send / receive / swap + суму

const SOLANA_SPAM = /t\.me|\.com|airdrop|claim/i;

// ─── Helius enriched transaction API (повна архівна Solana-історія) ──────────

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;   // вже у human-readable форматі (decimals враховано)
  decimals?: number;
  tokenStandard?: string;
}

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  slot: number;
  type: string;          // TRANSFER, SWAP, UNKNOWN ...
  transactionError: unknown;
  tokenTransfers: HeliusTokenTransfer[];
  nativeTransfers: HeliusNativeTransfer[];
}

async function fetchSolanaTransactionsHelius(
  address: string,
  walletId: string,
  apiKey: string,
  pageToken?: string,
  pageSize = 20,
): Promise<{ transactions: object[]; nextPageToken?: string }> {
  // Helius повертає вже розібрані транзакції: token transfers + native SOL
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('limit', String(Math.min(pageSize * 2, 100)));
  if (pageToken) url.searchParams.set('before', pageToken);

  // Wrapped SOL = нативний SOL
  const WSOL = 'So11111111111111111111111111111111111111112';

  // Символи токенів: з бази (balance) + відомі константи
  const mintMeta = new Map<string, { symbol: string; logoUrl: string | null }>();
  mintMeta.set(WSOL, { symbol: 'SOL', logoUrl: null });

  try {
    const bals = await prisma.tokenBalance.findMany({
      where: { walletId, chainName: 'solana', isSpam: false },
      select: { tokenAddress: true, tokenSymbol: true, logoUrl: true },
    });
    for (const b of bals) {
      if (b.tokenAddress) mintMeta.set(b.tokenAddress, { symbol: b.tokenSymbol, logoUrl: b.logoUrl });
    }
  } catch { /* ignore */ }

  const results: object[] = [];
  const MAX_HELIUS_FETCHES = 4; // максимум 4 запити щоб набрати pageSize
  let currentCursor = pageToken;
  let finalNextToken: string | undefined;

  for (let attempt = 0; attempt < MAX_HELIUS_FETCHES && results.length < pageSize; attempt++) {
    url.searchParams.set('limit', String(Math.min(pageSize * 2, 100)));
    if (currentCursor) url.searchParams.set('before', currentCursor);
    else url.searchParams.delete('before');

    let txs: HeliusTx[] = [];
    try {
      const r = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) { console.warn(`[Helius] HTTP ${r.status}`); break; }
      txs = (await r.json()) as HeliusTx[];
    } catch (err) {
      console.warn('[Helius] fetch error:', err instanceof Error ? err.message : err);
      break;
    }

    if (txs.length === 0) break;

    finalNextToken = txs[txs.length - 1]?.signature;
    currentCursor  = finalNextToken;

    // ── Збираємо невідомі мінти → Helius getAssetBatch ─────────────────
    const unknownMints = new Set<string>();
    for (const tx of txs) {
      for (const t of [...tx.tokenTransfers]) {
        if (t.mint && !mintMeta.has(t.mint)) unknownMints.add(t.mint);
      }
    }
    if (unknownMints.size > 0) {
      try {
        const assetRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getAssetBatch',
            params: { ids: Array.from(unknownMints) },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (assetRes.ok) {
          const assetData = (await assetRes.json()) as {
            result?: Array<{
              id: string;
              content?: { metadata?: { symbol?: string; name?: string } };
              token_info?: { symbol?: string };
            }>;
          };
          for (const asset of assetData.result ?? []) {
            const symbol =
              asset.token_info?.symbol ||
              asset.content?.metadata?.symbol ||
              asset.id.slice(0, 6);
            mintMeta.set(asset.id, { symbol, logoUrl: null });
          }
        }
      } catch { /* ignore — fallback to slice */ }
    }
    // ────────────────────────────────────────────────────────────────────

    for (const tx of txs) {
      if (tx.transactionError) continue;

      const symOf = (mint: string) =>
        mintMeta.get(mint)?.symbol ?? (mint === WSOL ? 'SOL' : mint.slice(0, 6));

      // ── Net-зміни: routing-кроки дають net ≈ 0 і виключаються ─────────
      const netByMint = new Map<string, number>();
      for (const t of tx.tokenTransfers) {
        if (t.fromUserAccount === address) netByMint.set(t.mint, (netByMint.get(t.mint) ?? 0) - t.tokenAmount);
        if (t.toUserAccount   === address) netByMint.set(t.mint, (netByMint.get(t.mint) ?? 0) + t.tokenAmount);
      }
      const wsolNet = netByMint.get(WSOL) ?? 0;
      netByMint.delete(WSOL);

      const nativeNet =
        tx.nativeTransfers.filter((t) => t.toUserAccount   === address).reduce((s, t) => s + t.amount, 0) / 1e9 -
        tx.nativeTransfers.filter((t) => t.fromUserAccount === address).reduce((s, t) => s + t.amount, 0) / 1e9;
      const totalSolNet = nativeNet + wsolNet;

      const THRESHOLD = 0.000001;
      const netOut: Array<[string, number]> = [...netByMint.entries()].filter(([, v]) => v < -THRESHOLD);
      const netIn:  Array<[string, number]> = [...netByMint.entries()].filter(([, v]) => v > THRESHOLD);
      if (totalSolNet >  THRESHOLD) netIn.push( [WSOL,  totalSolNet]);
      if (totalSolNet < -THRESHOLD) netOut.push([WSOL, totalSolNet]);

      let type: string;
      let tokenSymbol: string;
      let value: number | null = null;
      let sentValue: number | null = null;
      let logoUrl: string | null = null;
      let swapLogoUrl: string | null = null;
      let swapOutSymbol: string | null = null;
      let swapInSymbol: string | null = null;

      if (netOut.length > 0 && netIn.length > 0) {
        type = 'swap';
        const outSym = [...new Set(netOut.map(([m]) => symOf(m)))].join(', ');
        const inSym  = [...new Set(netIn.map( ([m]) => symOf(m)))].join(', ');
        if (SOLANA_SPAM.test(outSym) || SOLANA_SPAM.test(inSym)) continue;
        if (/[^\x00-\x7F]/.test(outSym) || /[^\x00-\x7F]/.test(inSym)) continue;
        tokenSymbol   = `${outSym} → ${inSym}`;
        value         = netIn.reduce( (s, [, v]) => s + Math.abs(v), 0);
        sentValue     = netOut.reduce((s, [, v]) => s + Math.abs(v), 0);
        swapOutSymbol = outSym; swapInSymbol = inSym;
        logoUrl       = mintMeta.get(netOut[0]![0])?.logoUrl ?? null;
        swapLogoUrl   = mintMeta.get(netIn[0]![0])?.logoUrl  ?? null;
      } else if (netIn.length > 0) {
        const [mint, delta] = netIn[0]!;
        const sym = symOf(mint);
        if (SOLANA_SPAM.test(sym) || /[^\x00-\x7F]/.test(sym)) continue;
        type = 'receive'; tokenSymbol = sym; value = Math.abs(delta);
        logoUrl = mintMeta.get(mint)?.logoUrl ?? null;
      } else if (netOut.length > 0) {
        const [mint, delta] = netOut[0]!;
        const sym = symOf(mint);
        if (SOLANA_SPAM.test(sym) || /[^\x00-\x7F]/.test(sym)) continue;
        type = 'send'; tokenSymbol = sym; value = Math.abs(delta);
        logoUrl = mintMeta.get(mint)?.logoUrl ?? null;
      } else {
        continue;
      }

      results.push({
        id: tx.signature, hash: tx.signature, chainName: 'solana',
        type, tokenSymbol, tokenName: tokenSymbol,
        fromAddress: (type === 'send' || type === 'swap') ? address : null,
        toAddress:   type === 'receive' ? address : null,
        value, sentValue, usdValue: null, status: 'success',
        timestamp: new Date(tx.timestamp * 1000).toISOString(),
        blockNumber: String(tx.slot),
        logoUrl, swapLogoUrl, swapOutSymbol, swapInSymbol,
      });

      if (results.length >= pageSize) break;
    } // end for tx
  } // end for attempt

  return { transactions: results.slice(0, pageSize), nextPageToken: finalNextToken };
}
// ────────────────────────────────────────────────────────────────────────────
const MIN_SOL_AMOUNT = 0.000001; // практично без фільтру по сумі

interface SolSig { signature: string; slot?: number; blockTime?: number | null; err?: unknown }
interface SolTokenBalance {
  mint: string;
  owner?: string;
  accountIndex: number;
  uiTokenAmount: { uiAmount: number | null };
}
interface SolParsedTx {
  slot: number;
  meta: {
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: SolTokenBalance[];
    postTokenBalances: SolTokenBalance[];
  } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string } | string>;
    };
  };
}

async function fetchSolanaTransactionsPage(
  address: string,
  walletId: string,
  pageToken?: string,
  pageSize = 20,
): Promise<{ transactions: object[]; nextPageToken?: string }> {
  // Ankr Solana RPC має повну архівну історію транзакцій (на відміну від публічного mainnet-beta)
  const ankrKey = process.env.ANKR_API_KEY;
  const rpcUrl =
    process.env.SOLANA_RPC_URL ??
    (ankrKey
      ? `https://rpc.ankr.com/solana/${ankrKey}`
      : 'https://api.mainnet-beta.solana.com');

  // ── 1. Підписи ──────────────────────────────────────────────────────────
  let sigs: SolSig[] = [];
  try {
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress',
        params: [address, { limit: pageSize * 2, ...(pageToken ? { before: pageToken } : {}) }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json() as { result?: SolSig[] };
    sigs = (d.result ?? []).filter((s) => !s.err);
  } catch { return { transactions: [] }; }

  if (sigs.length === 0) return { transactions: [] };

  // ── 2. Batch getTransaction ─────────────────────────────────────────────
  let parsedTxs: Array<{ id: number; result: SolParsedTx | null }> = [];
  try {
    const batch = sigs.map((s, i) => ({
      jsonrpc: '2.0', id: i,
      method: 'getTransaction',
      params: [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }));
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(25_000),
    });
    parsedTxs = await r.json() as typeof parsedTxs;
  } catch { /* fallback: no token data */ }

  // ── 3. Логотипи і символи токенів з TokenBalance ────────────────────────
  const mintMeta = new Map<string, { symbol: string; logoUrl: string | null }>();
  try {
    const balances = await prisma.tokenBalance.findMany({
      where: { walletId, chainName: 'solana', isSpam: false },
      select: { tokenAddress: true, tokenSymbol: true, logoUrl: true },
    });
    for (const b of balances) {
      if (b.tokenAddress) mintMeta.set(b.tokenAddress, { symbol: b.tokenSymbol, logoUrl: b.logoUrl });
    }
  } catch { /* ignore */ }

  // ── 4. Парсинг ──────────────────────────────────────────────────────────
  const results: object[] = [];

  for (let i = 0; i < sigs.length && results.length < pageSize; i++) {
    const sig = sigs[i]!;
    const txResult = parsedTxs.find((d) => d.id === i)?.result ?? null;
    const meta = txResult?.meta ?? null;
    const accountKeys = (txResult?.transaction?.message?.accountKeys ?? [])
      .map((k) => (typeof k === 'string' ? k : k.pubkey));
    const walletIdx = accountKeys.findIndex((k) => k === address);

    // SOL change (виключаємо комісію якщо платник = наш гаманець)
    let solChange = 0;
    if (meta && walletIdx >= 0) {
      const pre = (meta.preBalances[walletIdx] ?? 0) / 1e9;
      const post = (meta.postBalances[walletIdx] ?? 0) / 1e9;
      solChange = post - pre;
      if (walletIdx === 0) solChange += meta.fee / 1e9; // повертаємо комісію для відображення
    }

    // Token changes (diff pre/post для нашої адреси)
    const tokenChanges: Array<{ mint: string; change: number }> = [];
    if (meta) {
      const preMap = new Map<string, number>();
      for (const p of meta.preTokenBalances) {
        if (p.owner === address) preMap.set(p.mint, p.uiTokenAmount.uiAmount ?? 0);
      }
      for (const p of meta.postTokenBalances) {
        if (p.owner === address) {
          const change = (p.uiTokenAmount.uiAmount ?? 0) - (preMap.get(p.mint) ?? 0);
          if (Math.abs(change) > 0) tokenChanges.push({ mint: p.mint, change });
        }
      }
      // Повністю витрачені токени (є в pre але не в post)
      for (const [mint, preAmt] of preMap) {
        if (!meta.postTokenBalances.find((p) => p.owner === address && p.mint === mint) && preAmt > 0) {
          tokenChanges.push({ mint, change: -preAmt });
        }
      }
    }

    // Fallback: якщо RPC не повернув деталі (стара транзакція, архівована)
    if (!txResult || !meta) {
      results.push({
        id: sig.signature, hash: sig.signature, chainName: 'solana',
        type: 'transfer', tokenSymbol: 'SOL', tokenName: 'Solana',
        fromAddress: null, toAddress: null,
        value: null, sentValue: null, usdValue: null, status: 'success',
        timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : new Date().toISOString(),
        blockNumber: String(sig.slot ?? 0),
        logoUrl: null, swapLogoUrl: null, swapOutSymbol: null, swapInSymbol: null,
      });
      continue;
    }

    // Класифікація
    const outTokens = tokenChanges.filter((c) => c.change < 0);
    const inTokens  = tokenChanges.filter((c) => c.change > 0);

    let type: string;
    let tokenSymbol: string;
    let value: number | null = null;
    let sentValue: number | null = null;
    let logoUrl: string | null = null;
    let swapLogoUrl: string | null = null;
    let swapOutSymbol: string | null = null;
    let swapInSymbol: string | null = null;

    if (outTokens.length > 0 && inTokens.length > 0) {
      type = 'swap';
      const outSym = [...new Set(outTokens.map((c) => mintMeta.get(c.mint)?.symbol ?? c.mint.slice(0, 6)))].join(', ');
      const inSym  = [...new Set(inTokens.map((c)  => mintMeta.get(c.mint)?.symbol ?? c.mint.slice(0, 6)))].join(', ');
      tokenSymbol = `${outSym} → ${inSym}`;
      value     = inTokens.reduce((s, c)  => s + Math.abs(c.change), 0);
      sentValue = outTokens.reduce((s, c) => s + Math.abs(c.change), 0);
      swapOutSymbol = outSym; swapInSymbol = inSym;
      logoUrl     = mintMeta.get(outTokens[0]!.mint)?.logoUrl ?? null;
      swapLogoUrl = mintMeta.get(inTokens[0]!.mint)?.logoUrl  ?? null;
    } else if (tokenChanges.length > 0) {
      const tc = tokenChanges[0]!;
      const meta2 = mintMeta.get(tc.mint);
      tokenSymbol = meta2?.symbol ?? tc.mint.slice(0, 6);
      type  = tc.change > 0 ? 'receive' : 'send';
      value = Math.abs(tc.change);
      logoUrl = meta2?.logoUrl ?? null;
    } else if (Math.abs(solChange) >= MIN_SOL_AMOUNT) {
      tokenSymbol = 'SOL';
      type  = solChange > 0 ? 'receive' : 'send';
      value = Math.abs(solChange);
    } else {
      continue; // не цікава транзакція
    }

    // Спам-фільтри (ті ж що й для EVM)
    const symCheck = tokenSymbol.replaceAll(/→/g, ' ');
    if (/[^\x00-\x7F]/.test(symCheck)) continue;
    if (SOLANA_SPAM.test(symCheck)) continue;
    if (value !== null && value < MIN_SOL_AMOUNT) continue;

    results.push({
      id: sig.signature, hash: sig.signature, chainName: 'solana',
      type, tokenSymbol, tokenName: tokenSymbol,
      fromAddress: type === 'send' ? address : null,
      toAddress:   type === 'receive' ? address : null,
      value, sentValue, usdValue: null, status: 'success',
      timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : new Date().toISOString(),
      blockNumber: String(sig.slot ?? txResult?.slot ?? 0),
      logoUrl, swapLogoUrl, swapOutSymbol, swapInSymbol,
    });
  }

  const lastSig = sigs.length >= pageSize ? sigs[Math.min(sigs.length - 1, pageSize * 2 - 1)]?.signature : undefined;
  return { transactions: results, nextPageToken: lastSig };
}
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const sp = req.nextUrl.searchParams;
    const pageToken = sp.get('pageToken') ?? undefined;
    const pageSize = Math.min(Number.parseInt(sp.get('pageSize') ?? '20', 10), 50);

    const wallet = await prisma.wallet.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true, address: true, network: true },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    // Кеш-ключ для обох мереж
    const cacheKey = `${wallet.address}::${pageToken ?? ''}::${pageSize}`;
    type PagePayload = { transactions: object[]; nextPageToken?: string; hasMore: boolean };

    const cached = cacheGet<PagePayload>(cacheKey);
    if (cached) return ok(cached);

    // Solana: Helius (повна архівна історія) або fallback на RPC (обмежена)
    if (wallet.network !== 'EVM') {
      const heliusKey = process.env.HELIUS_API_KEY;
      const solPayload = heliusKey
        ? await fetchSolanaTransactionsHelius(wallet.address, wallet.id, heliusKey, pageToken, pageSize)
        : await fetchSolanaTransactionsPage(wallet.address, wallet.id, pageToken, pageSize);
      const solResult: PagePayload = { ...solPayload, hasMore: !!solPayload.nextPageToken };
      cacheSet(cacheKey, solResult);
      return ok(solResult);
    }

    const { transactions, nextPageToken } = await fetchTransactionsPage(
      wallet.address,
      pageToken,
      pageSize,
    );

    // Логотипи з TokenBalance
    const symbolChainPairs = new Set<string>();
    for (const t of transactions) {
      if (!t.tokenSymbol || !t.chainName) continue;
      for (const sym of parseSwapSymbols(t.tokenSymbol)) {
        symbolChainPairs.add(`${sym.toLowerCase()}::${t.chainName}`);
      }
    }

    const logoMap = new Map<string, string | null>();
    if (symbolChainPairs.size > 0) {
      const pairs = Array.from(symbolChainPairs);
      const balances = await prisma.tokenBalance.findMany({
        where: {
          walletId: wallet.id,
          OR: pairs.map((pair) => {
            const [sym, chain] = pair.split('::');
            return { tokenSymbol: { equals: sym, mode: 'insensitive' as const }, chainName: chain };
          }),
        },
        select: { tokenSymbol: true, chainName: true, logoUrl: true },
      });
      for (const b of balances) {
        const key = `${b.tokenSymbol.toLowerCase()}::${b.chainName}`;
        if (!logoMap.has(key) && b.logoUrl) logoMap.set(key, b.logoUrl);
      }
    }

    const result = transactions.map((t) => {
      const symbols = t.tokenSymbol ? parseSwapSymbols(t.tokenSymbol) : [];
      const chain = t.chainName ?? '';
      return {
        id: t.hash,
        hash: t.hash,
        chainName: t.chainName,
        type: t.type,
        tokenSymbol: t.tokenSymbol,
        tokenName: t.tokenName,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        value: t.value,
        sentValue: t.sentValue ?? null,
        usdValue: t.usdValue,
        status: t.status,
        timestamp: t.timestamp.toISOString(),
        blockNumber: t.blockNumber ? t.blockNumber.toString() : null,
        logoUrl: symbols[0]
          ? (logoMap.get(`${symbols[0].toLowerCase()}::${chain}`) ?? null)
          : null,
        swapLogoUrl: symbols[1]
          ? (logoMap.get(`${symbols[1].toLowerCase()}::${chain}`) ?? null)
          : null,
        swapOutSymbol: symbols.length > 1 ? (symbols[0] ?? null) : null,
        swapInSymbol: symbols.length > 1 ? (symbols[1] ?? null) : null,
      };
    });

    const payload = { transactions: result, nextPageToken, hasMore: !!nextPageToken };
    cacheSet(cacheKey, payload);
    return ok(payload);
  } catch (err) {
    return handleUnknown(err);
  }
}
