import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { paginationSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const sp = req.nextUrl.searchParams;
    const parsed = paginationSchema.safeParse({
      page: sp.get('page') ?? undefined,
      pageSize: sp.get('pageSize') ?? undefined,
    });
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }
    const { page, pageSize } = parsed.data;

    const [items, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where: { userId: guard.user.id },
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notificationLog.count({ where: { userId: guard.user.id } }),
    ]);

    return ok({
      logs: items,
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
