import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { profileUpdateSchema } from '@/lib/utils/validators';

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

    return ok({ user });
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
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    const data: { name?: string | null; telegramChatId?: string | null } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name || null;
    if (parsed.data.telegramChatId !== undefined) {
      data.telegramChatId = parsed.data.telegramChatId
        ? parsed.data.telegramChatId
        : null;
    }

    const user = await prisma.user.update({
      where: { id: guard.user.id },
      data,
      select: { id: true, email: true, name: true, telegramChatId: true },
    });

    return ok({ user });
  } catch (err) {
    return handleUnknown(err);
  }
}
