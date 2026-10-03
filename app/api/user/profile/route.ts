import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { profileUpdateSchema } from '@/lib/utils/validators';
import { publicEmail } from '@/lib/auth/public-email';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const user = await prisma.user.findUnique({
      where: { id: guard.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramChatId: true,
        createdAt: true,
      },
    });
    if (!user) return apiError('NOT_FOUND', 'Користувача не знайдено');

    return ok({ user: { ...user, email: publicEmail(user.email) } });
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'BAD_REQUEST',
        'Помилка валідації',
        parsed.error.flatten(),
      );
    }

    const data: { name?: string | null; telegramChatId?: string | null } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name || null;
    if (parsed.data.telegramChatId !== undefined) {
      data.telegramChatId = parsed.data.telegramChatId
        ? BigInt(parsed.data.telegramChatId).toString()
        : null;
    }

    const user = await prisma.$transaction(
      async (tx) => {
        if (
          data.telegramChatId &&
          (await tx.user.findFirst({
            where: {
              telegramChatId: data.telegramChatId,
              id: { not: guard.user.id },
            },
          }))
        )
          return null;
        return tx.user.update({
          where: { id: guard.user.id },
          data,
          select: { id: true, email: true, name: true, telegramChatId: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!user)
      return apiError(
        'CONFLICT',
        'Этот Telegram уже подключён к другому профилю для уведомлений. Используйте основной аккаунт.',
      );

    return ok({ user: { ...user, email: publicEmail(user.email) } });
  } catch (err) {
    return handleUnknown(err);
  }
}
