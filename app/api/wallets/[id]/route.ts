import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, noContent, ok } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const wallet = await prisma.wallet.findFirst({
      where: { id: params.id, userId: guard.user.id },
      include: {
        // Повертаємо ВСІ балансу (UI сам вирішить що показати), але totalUsd
        // рахуємо лише з видимих — щоб число у заголовку було чесним
        balances: { orderBy: { usdValue: 'desc' } },
        _count: { select: { transactions: true } },
      },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    const totalUsd = wallet.balances
      .filter((b) => !b.isSpam && !b.isHidden)
      .reduce((s, b) => s + b.usdValue, 0);
    return ok({ wallet: { ...wallet, totalUsd } });
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const wallet = await prisma.wallet.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    await prisma.wallet.delete({ where: { id: wallet.id } });
    return noContent();
  } catch (err) {
    return handleUnknown(err);
  }
}
