import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';

export const dynamic = 'force-dynamic';

// Поріг: якщо токен, що приховується, вартує більше цього — старі snapshot'и
// некоректні і їх потрібно видалити.
const SNAPSHOT_INVALIDATION_THRESHOLD_USD = 50;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tokenId: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const wallet = await prisma.wallet.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    const token = await prisma.tokenBalance.findFirst({
      where: { id: params.tokenId, walletId: wallet.id },
      select: { id: true, isHidden: true, usdValue: true },
    });
    if (!token) return apiError('NOT_FOUND', 'Токен не знайдено');

    const body = (await req.json().catch(() => null)) as
      | { isHidden?: boolean }
      | null;

    const isHidden =
      typeof body?.isHidden === 'boolean' ? body.isHidden : !token.isHidden;

    const updated = await prisma.tokenBalance.update({
      where: { id: token.id },
      data: { isHidden },
      select: { id: true, isHidden: true, tokenSymbol: true },
    });

    // Якщо токен приховується і його вартість суттєва — старі snapshot'и тепер
    // некоректні (містять завищену вартість). Видаляємо і одразу створюємо новий.
    if (isHidden && token.usdValue >= SNAPSHOT_INVALIDATION_THRESHOLD_USD) {
      await prisma.portfolioSnapshot.deleteMany({ where: { userId: guard.user.id } });
      await savePortfolioSnapshot(guard.user.id);
    }

    return ok({ token: updated });
  } catch (err) {
    return handleUnknown(err);
  }
}
