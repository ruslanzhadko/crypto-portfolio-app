import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { paginationSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

const querySchema = paginationSchema.extend({
  status: z.enum(['sent', 'failed']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      page: sp.get('page') ?? undefined,
      pageSize: sp.get('pageSize') ?? undefined,
      status: sp.get('status') ?? undefined,
    });
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }
    const { page, pageSize, status } = parsed.data;

    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.notificationLog.count({ where }),
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
