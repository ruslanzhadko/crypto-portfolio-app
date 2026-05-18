import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, noContent, ok } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  isBlocked: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    if (params.id === guard.user.id) {
      return apiError('BAD_REQUEST', 'Не можна змінювати власний акаунт');
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true },
    });
    if (!target) return apiError('NOT_FOUND', 'Користувача не знайдено');
    if (target.role === 'ADMIN') {
      return apiError('FORBIDDEN', 'Не можна блокувати адміністратора');
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: parsed.data,
      select: { id: true, email: true, isBlocked: true },
    });

    return ok({ user: updated });
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    if (params.id === guard.user.id) {
      return apiError('BAD_REQUEST', 'Не можна видалити власний акаунт');
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true },
    });
    if (!target) return apiError('NOT_FOUND', 'Користувача не знайдено');
    if (target.role === 'ADMIN') {
      return apiError('FORBIDDEN', 'Не можна видалити адміністратора');
    }

    await prisma.user.delete({ where: { id: target.id } });
    return noContent();
  } catch (err) {
    return handleUnknown(err);
  }
}
