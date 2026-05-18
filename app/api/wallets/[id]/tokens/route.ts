import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';

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
      select: { id: true },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    const tokens = await prisma.tokenBalance.findMany({
      where: { walletId: wallet.id },
      orderBy: { usdValue: 'desc' },
    });

    const totalUsd = tokens.reduce((s, t) => s + t.usdValue, 0);
    return ok({ tokens, totalUsd });
  } catch (err) {
    return handleUnknown(err);
  }
}
