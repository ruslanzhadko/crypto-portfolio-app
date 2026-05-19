import { prisma } from '@/lib/db/prisma';
import { syncWallet, type SyncResult } from '@/lib/services/wallet-sync';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';

// Хвилин до наступного sync для одного гаманця.
// EVM баланси — Ankr (безлімітно); Solana — Moralis.
// Ціни/зміни — DexScreener/Binance через price-feed.ts (безкоштовно).
export const SYNC_THROTTLE_MINUTES = 30;

export interface PortfolioSyncResult {
  synced: SyncResult[];
  skipped: SkippedWallet[];
  errors: SyncError[];
  durationMs: number;
}

export interface SkippedWallet {
  walletId: string;
  label: string | null;
  reason: 'throttled';
  lastSyncAt: Date | null;
  nextSyncInSeconds: number;
}

export interface SyncError {
  walletId: string;
  label: string | null;
  message: string;
}

/**
 * Синхронізує всі гаманці користувача паралельно.
 * За замовчуванням пропускає ті, що були синхронізовані менше ніж SYNC_THROTTLE_MINUTES тому.
 * При force=true throttle ігнорується.
 */
export async function syncAllWallets(
  userId: string,
  options: { force?: boolean } = {},
): Promise<PortfolioSyncResult> {
  const startedAt = Date.now();
  const { force = false } = options;
  const throttleMs = SYNC_THROTTLE_MINUTES * 60 * 1000;
  const now = Date.now();

  const wallets = await prisma.wallet.findMany({
    where: { userId, isActive: true },
    select: { id: true, label: true, lastSyncAt: true },
  });

  const toSync: typeof wallets = [];
  const skipped: SkippedWallet[] = [];

  for (const w of wallets) {
    if (!force && w.lastSyncAt) {
      const elapsed = now - w.lastSyncAt.getTime();
      if (elapsed < throttleMs) {
        skipped.push({
          walletId: w.id,
          label: w.label,
          reason: 'throttled',
          lastSyncAt: w.lastSyncAt,
          nextSyncInSeconds: Math.ceil((throttleMs - elapsed) / 1000),
        });
        continue;
      }
    }
    toSync.push(w);
  }

  // Послідовний sync — захист від rate limit Ankr (3 паралельних → 401).
  // Для 3 гаманців: ~5-10с кожен = 15-30с сумарно. Вкладається в maxDuration=60.
  const synced: SyncResult[] = [];
  const errors: SyncError[] = [];
  for (const w of toSync) {
    try {
      synced.push(await syncWallet(w.id));
    } catch (err) {
      errors.push({
        walletId: w.id,
        label: w.label,
        message: err instanceof Error ? err.message : 'Невідома помилка',
      });
    }
  }

  if (synced.length > 0) {
    savePortfolioSnapshot(userId).catch(() => {});
  }

  return {
    synced,
    skipped,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
