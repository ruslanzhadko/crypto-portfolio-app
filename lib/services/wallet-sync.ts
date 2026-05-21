import { Network } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  fetchWalletTokens,
  MIN_TOKEN_USD,
  type NormalizedToken,
} from '@/lib/services/moralis';
import { fetchEVMBalancesFromAnkr } from '@/lib/services/ankr';
import { fetchPricesByIds, type SimplePriceItem } from '@/lib/services/coingecko';
import { fetchPrices, type PriceQuery } from '@/lib/services/price-feed';
import { getChainInfo } from '@/lib/utils/networks';

export interface SyncResult {
  walletId: string;
  tokensSynced: number;
  transactionsSynced: number;
  spamFiltered: number;
  totalUsd: number;
  syncedAt: Date;
}

// Ключ для ідентифікації токена незалежно від id запису в БД
function tokenKey(chainName: string, tokenAddress: string, tokenSymbol: string): string {
  return `${chainName}::${tokenAddress}::${tokenSymbol.toLowerCase()}`;
}

export async function syncWallet(walletId: string): Promise<SyncResult> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { id: true, address: true, network: true },
  });
  if (!wallet) throw new Error('Гаманець не знайдено');

  // Транзакції більше не синхронізуються в БД — підтягуються live з Ankr при перегляді.
  const isEvm = wallet.network === Network.EVM;
  const tokens = isEvm
    ? await fetchEVMBalancesFromAnkr(wallet.address)
    : await fetchWalletTokens(wallet.address, wallet.network);

  const enriched = await applyCachedPrices(tokens, wallet.network);
  await enrichMissingPrices(enriched);

  const spamCount = enriched.filter(
    (t) => t.isSpam || (!t.isNative && t.usdValue < MIN_TOKEN_USD),
  ).length;

  const toSave = enriched.filter((t) => t.balance > 0);

  // Зберігаємо isHidden/isSpam перед видаленням — щоб відновити після sync
  const prevTokens = await prisma.tokenBalance.findMany({
    where: { walletId },
    select: { chainName: true, tokenAddress: true, tokenSymbol: true, isHidden: true },
  });
  const prevHidden = new Map<string, boolean>();
  for (const t of prevTokens) {
    if (t.isHidden) {
      prevHidden.set(tokenKey(t.chainName, t.tokenAddress, t.tokenSymbol), true);
    }
  }

  // Якщо API повернув 0 токенів але в БД вже є дані — підозрілий стан
  // (ліміт API, порожня відповідь). Не видаляємо, просто оновлюємо lastSyncAt.
  if (toSave.length === 0) {
    const existing = await prisma.tokenBalance.count({ where: { walletId } });
    if (existing > 0) {
      await prisma.wallet.update({ where: { id: walletId }, data: { lastSyncAt: new Date() } });
      return { walletId, tokensSynced: 0, transactionsSynced: 0, spamFiltered: 0, totalUsd: 0, syncedAt: new Date()} ;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tokenBalance.deleteMany({ where: { walletId } });

    if (toSave.length > 0) {
      await tx.tokenBalance.createMany({
        data: toSave.map((t) => {
          const key = tokenKey(t.chainName, t.address, t.symbol);
          return {
            walletId,
            tokenSymbol: t.symbol,
            tokenName: t.name,
            chainName: t.chainName,
            tokenAddress: t.address,
            decimals: t.decimals,
            balance: t.balance,
            usdValue: t.usdValue,
            priceUsd: t.priceUsd,
            priceChange24h: t.priceChange24h,
            logoUrl: t.logoUrl,
            coingeckoId: t.coingeckoId ?? null,
            isSpam: t.isSpam || (!t.isNative && t.usdValue < MIN_TOKEN_USD),
            // Відновлюємо isHidden якщо токен раніше був прихований користувачем
            isHidden: prevHidden.get(key) ?? false,
          };
        }),
        skipDuplicates: true,
      });
    }

    await tx.wallet.update({
      where: { id: walletId },
      data: { lastSyncAt: new Date() },
    });
  });

  const totalUsd = toSave
    .filter((t) => !prevHidden.get(tokenKey(t.chainName, t.address, t.symbol)))
    .reduce((s, t) => s + t.usdValue, 0);

  return {
    walletId,
    tokensSynced: toSave.length,
    transactionsSynced: 0,
    spamFiltered: spamCount,
    totalUsd,
    syncedAt: new Date(),
  };
}

// ─────────────────────────────────────────
// Підтягування цін для токенів без USD-вартості
// ─────────────────────────────────────────

/**
 * Заповнює ціни для токенів, які Moralis повернув без `priceUsd` або з нульовим `usdValue`.
 *
 * Pipeline:
 *  1. price-feed (Binance native + DexScreener за contract address) — головне джерело.
 *  2. CoinGecko по coingeckoId — fallback для токенів без DEX-листингу.
 *
 * CoinGecko результати кешуються у `TokenPrice` (як раніше). DexScreener/Binance
 * не кешуються — їх дешево перезапитати при наступному sync.
 */
async function enrichMissingPrices(tokens: EnrichedToken[]): Promise<void> {
  // Ankr повертає priceUsd/usdValue, але не priceChange24h.
  // Включаємо всі токени з priceChange24h === 0 щоб DexScreener/Binance їх збагатив.
  const needPricing = tokens.filter(
    (t) => t.priceUsd === 0 || t.usdValue === 0 || t.priceChange24h === 0 || !t.logoUrl,
  );
  if (needPricing.length === 0) return;

  // ── 1. price-feed (Binance + DexScreener) ──
  const queries: PriceQuery[] = needPricing.map((t) => ({
    key: priceFeedKey(t),
    isNative: t.isNative,
    chainName: t.chainName,
    contractAddress: t.isNative ? undefined : t.address || undefined,
  }));
  const feedPrices = await fetchPrices(queries).catch(() => new Map());

  for (const t of needPricing) {
    const p = feedPrices.get(priceFeedKey(t));
    if (!p) continue;
    applyPriceToToken(t, p.price, p.change24h, p.logoUrl);
  }

  // Persist logos back to TokenPrice so subsequent syncs read them from cache
  const withNewLogos = needPricing.filter((t) => t.logoUrl && t.coingeckoId);
  if (withNewLogos.length > 0) {
    await Promise.allSettled(
      withNewLogos.map((t) =>
        prisma.tokenPrice.updateMany({
          where: { tokenId: t.coingeckoId!, logoUrl: null },
          data: { logoUrl: t.logoUrl! },
        }),
      ),
    );
  }

  // ── 2. CoinGecko fallback (тільки для токенів, що залишились без ціни) ──
  const stillMissing = needPricing.filter(
    (t) => (t.priceUsd === 0 || !t.logoUrl) && t.coingeckoId,
  );
  if (stillMissing.length === 0) return;

  const cgIds = Array.from(new Set(stillMissing.map((t) => t.coingeckoId!)));
  const cgPrices = await fetchPricesByIds(cgIds).catch(() => new Map());
  if (cgPrices.size === 0) return;

  for (const t of stillMissing) {
    const p = cgPrices.get(t.coingeckoId!);
    if (!p) continue;
    applyPriceToToken(t, p.price, p.change24h, p.image ?? undefined);
  }

  await saveCoinGeckoPricesToCache(cgPrices);
}

// Persists CoinGecko prices to TokenPrice cache so the cron and market pages can reuse them.
async function saveCoinGeckoPricesToCache(prices: Map<string, SimplePriceItem>): Promise<void> {
  const now = new Date();
  await Promise.allSettled(
    Array.from(prices.values()).map((p) =>
      prisma.tokenPrice
        .upsert({
          where: { tokenId: p.id },
          create: {
            tokenId: p.id,
            symbol: p.symbol ?? p.id,
            name: p.name ?? p.id,
            currentPrice: p.price,
            priceChange24h: p.change24h,
            marketCap: p.marketCap ?? null,
            volume24h: p.volume24h ?? null,
            logoUrl: p.image ?? null,
          },
          update: {
            currentPrice: p.price,
            priceChange24h: p.change24h,
            marketCap: p.marketCap ?? null,
            volume24h: p.volume24h ?? null,
            ...(p.image ? { logoUrl: p.image } : {}),
          },
        })
        .then(() =>
          prisma.priceHistory.create({
            data: { tokenId: p.id, price: p.price, timestamp: now },
          }),
        ),
    ),
  );
}

function priceFeedKey(t: EnrichedToken): string {
  return `${t.chainName}::${t.isNative ? 'native' : t.address}::${t.symbol.toLowerCase()}`;
}

function applyPriceToToken(
  t: EnrichedToken,
  price: number,
  change24h: number,
  logoUrl?: string,
): void {
  if (!t.logoUrl && logoUrl) t.logoUrl = logoUrl;
  if (!Number.isFinite(price) || price <= 0) return;
  if (t.priceUsd === 0) t.priceUsd = price;
  if (t.priceChange24h === 0 && Number.isFinite(change24h)) {
    t.priceChange24h = Math.max(-99.9, Math.min(change24h, 10_000));
  }
  if (t.usdValue === 0) t.usdValue = t.balance * price;
}

// ─────────────────────────────────────────
// Збагачення кешованими цінами
// ─────────────────────────────────────────

interface EnrichedToken extends NormalizedToken {
  coingeckoId: string | null;
}

async function applyCachedPrices(
  tokens: NormalizedToken[],
  network: Network,
): Promise<EnrichedToken[]> {
  if (tokens.length === 0) return [];

  const symbols = Array.from(new Set(tokens.map((t) => t.symbol.toLowerCase())));
  const cached = await prisma.tokenPrice.findMany({
    where: { symbol: { in: symbols, mode: 'insensitive' } },
  });

  const priceBySymbol = new Map<string, { price: number; change24h: number; id: string; logoUrl: string | null }>();
  for (const p of cached) {
    const key = p.symbol.toLowerCase();
    if (!priceBySymbol.has(key)) {
      priceBySymbol.set(key, {
        price: p.currentPrice,
        change24h: p.priceChange24h,
        id: p.tokenId,
        logoUrl: p.logoUrl ?? null,
      });
    }
  }

  return tokens.map((t): EnrichedToken => {
    const fromCache = priceBySymbol.get(t.symbol.toLowerCase());
    let coingeckoId: string | null = null;
    let usdValue = t.usdValue;
    let priceUsd = t.priceUsd;
    let priceChange24h = t.priceChange24h;
    let logoUrl = t.logoUrl;

    if (t.isNative) {
      const chainInfo = getChainInfo(t.chainName);
      coingeckoId = chainInfo?.coingeckoNativeId ?? null;
      // Нативний токен — логотип з ChainInfo (Trust Wallet CDN) якщо не прийшов від API
      if (!logoUrl && chainInfo?.nativeLogoUrl) logoUrl = chainInfo.nativeLogoUrl;
      if (fromCache) {
        if (priceUsd === 0) priceUsd = fromCache.price;
        if (priceChange24h === 0) priceChange24h = fromCache.change24h;
        if (usdValue === 0) usdValue = t.balance * fromCache.price;
      }
    } else if (fromCache) {
      // Для не-нативних EVM/Solana токенів — лише як fallback за символом
      coingeckoId = fromCache.id;
      if (priceUsd === 0) priceUsd = fromCache.price;
      if (priceChange24h === 0) priceChange24h = fromCache.change24h;
      if (usdValue === 0) usdValue = t.balance * fromCache.price;
      if (!logoUrl && fromCache.logoUrl) logoUrl = fromCache.logoUrl;
    }

    return { ...t, usdValue, priceUsd, priceChange24h, coingeckoId, logoUrl };
  });
}
