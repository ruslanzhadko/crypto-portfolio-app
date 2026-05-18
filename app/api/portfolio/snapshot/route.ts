import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { getPortfolioSnapshots } from '@/lib/services/portfolio';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v) => [1, 7, 30].includes(v), {
      message: 'days має бути одним з 1, 7, 30',
    })
    .default(30),
});

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const parsed = querySchema.safeParse({
      days: req.nextUrl.searchParams.get('days') ?? undefined,
    });
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    const { points, source } = await getPortfolioSnapshots(guard.user.id, parsed.data.days);
    return ok({ points, source, days: parsed.data.days });
  } catch (err) {
    return handleUnknown(err);
  }
}
