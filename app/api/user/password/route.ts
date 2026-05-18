import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { passwordChangeSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = passwordChangeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    const user = await prisma.user.findUnique({
      where: { id: guard.user.id },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      return apiError('NOT_FOUND', 'Користувача не знайдено');
    }

    const ok_ = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok_) {
      return apiError('BAD_REQUEST', 'Поточний пароль невірний');
    }

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: guard.user.id },
      data: { passwordHash: newHash },
    });

    return ok({ success: true });
  } catch (err) {
    return handleUnknown(err);
  }
}
