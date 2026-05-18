import { prisma } from '@/lib/db/prisma';
import { fetchWalletPortfolioHistory } from '@/lib/services/covalent';

/**
 * Заповнює `PortfolioSnapshot` записами з Covalent за останні ~30 днів.
 * Викликається один раз — при першому sync гаманця.
 *
 * Умови запуску:
 * - COVALENT_API_KEY задано
 * - Користувач ще не має snapshot'ів старших за 2 дні (щоб не перезаписати накопичену реальну історію)
 */
export async function backfillPortfolioHistory(
  walletId: string,
  userId: string,
): Promise<void> {
  if (!process.env.COVALENT_API_KEY) return;

  // Не робимо backfill якщо вже є накопичена стара історія
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const hasOlderHistory = await prisma.portfolioSnapshot.count({
    where: { userId, timestamp: { lt: twoDaysAgo } },
  });
  if (hasOlderHistory > 0) return;

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { address: true, network: true },
  });
  if (!wallet) return;

  const points = await fetchWalletPortfolioHistory(wallet.address, wallet.network);
  if (points.length === 0) return;

  // Перевіряємо які дати вже є (щоб не дублювати)
  const earliest = new Date(points[0]!.timestamp);
  const existing = await prisma.portfolioSnapshot.findMany({
    where: { userId, timestamp: { gte: earliest } },
    select: { timestamp: true },
  });
  const existingDateKeys = new Set(
    existing.map((s) => s.timestamp.toISOString().slice(0, 10)),
  );

  // Сьогодні пропускаємо — savePortfolioSnapshot вже додав актуальний snapshot
  const todayKey = new Date().toISOString().slice(0, 10);

  const toInsert = points
    .filter((p) => {
      const dateKey = new Date(p.timestamp).toISOString().slice(0, 10);
      return p.totalUsd > 0 && dateKey !== todayKey && !existingDateKeys.has(dateKey);
    })
    .map((p) => ({
      userId,
      totalUsd: p.totalUsd,
      timestamp: new Date(p.timestamp),
    }));

  if (toInsert.length === 0) return;

  await prisma.portfolioSnapshot.createMany({ data: toInsert });
  console.log(`[backfill] userId=${userId} додано ${toInsert.length} snapshot'ів з Covalent`);
}
