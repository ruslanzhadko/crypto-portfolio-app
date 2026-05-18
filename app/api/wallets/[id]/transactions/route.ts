import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { paginationSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const sp = req.nextUrl.searchParams;
    const paged = paginationSchema.safeParse({
      page: sp.get('page') ?? undefined,
      pageSize: sp.get('pageSize') ?? undefined,
    });
    if (!paged.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', paged.error.flatten());
    }
    const { page, pageSize } = paged.data;

    const wallet = await prisma.wallet.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    const transactions = items.map((t) => ({
      ...t,
      blockNumber: t.blockNumber ? t.blockNumber.toString() : null,
    }));

    return ok({
      transactions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    return handleUnknown(err);
  }
}
