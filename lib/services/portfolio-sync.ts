import { prisma } from '@/lib/db/prisma';
import { syncWallet, type SyncResult } from '@/lib/services/wallet-sync';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';

// Хвилин до наступного auto-sync для одного гаманця.
// 5 хв ≈ 12 syncів/год на гаманець у найгіршому випадку — у межах безкоштовного Moralis.
export const SYNC_THROTTLE_MINUTES = 5;

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

  const results = await Promise.allSettled(toSync.map((w) => syncWallet(w.id)));

  const synced: SyncResult[] = [];
  const errors: SyncError[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const w = toSync[i]!;
    if (r.status === 'fulfilled') {
      synced.push(r.value);
    } else {
      errors.push({
        walletId: w.id,
        label: w.label,
        message: r.reason instanceof Error ? r.reason.message : 'Невідома помилка',
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
