import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { paginationSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin();
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
    const search = sp.get('q')?.trim() ?? '';

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isBlocked: true,
          createdAt: true,
          telegramChatId: true,
          _count: {
            select: { wallets: true, triggers: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return ok({
      users: items,
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
