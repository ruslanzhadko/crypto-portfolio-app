import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, noContent, ok } from '@/lib/api/response';
import { triggerUpdateSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const trigger = await prisma.priceTrigger.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true },
    });
    if (!trigger) return apiError('NOT_FOUND', 'Тригер не знайдено');

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = triggerUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    const updated = await prisma.priceTrigger.update({
      where: { id: trigger.id },
      data: parsed.data,
    });
    return ok({ trigger: updated });
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

    const trigger = await prisma.priceTrigger.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true },
    });
    if (!trigger) return apiError('NOT_FOUND', 'Тригер не знайдено');

    await prisma.priceTrigger.delete({ where: { id: trigger.id } });
    return noContent();
  } catch (err) {
    return handleUnknown(err);
  }
}
