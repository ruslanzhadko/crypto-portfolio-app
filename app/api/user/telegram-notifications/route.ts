import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { telegramBotReady } from '@/lib/auth/social';

const schema = z
  .object({ enabled: z.boolean(), useLinked: z.boolean().optional() })
  .strict();
export async function PUT(req: NextRequest) {
  try {
    if (req.headers.get('origin') !== req.nextUrl.origin)
      return apiError('FORBIDDEN', 'Invalid origin');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError('BAD_REQUEST', 'Invalid request');
    const result = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: guard.user.id } });
        if (!user || user.isBlocked) return 'UNAVAILABLE';
        if (!parsed.data.enabled) {
          await tx.user.update({
            where: { id: user.id },
            data: { telegramNotificationsEnabled: false },
          });
          return 'OK';
        }
        let chatId = user.telegramChatId;
        if (parsed.data.useLinked || !chatId) {
          if (
            !user.telegramUserId ||
            !user.telegramBotAccess ||
            !telegramBotReady()
          )
            return 'REAUTHORIZE';
          chatId = user.telegramUserId;
        }
        const other = await tx.user.findFirst({
          where: { telegramChatId: chatId, id: { not: user.id } },
        });
        if (other) return 'CONFLICT';
        await tx.user.update({
          where: { id: user.id },
          data: { telegramChatId: chatId, telegramNotificationsEnabled: true },
        });
        return 'OK';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result === 'CONFLICT')
      return apiError(
        'CONFLICT',
        'Telegram recipient belongs to another profile',
      );
    if (result !== 'OK') return apiError('BAD_REQUEST', result);
    return ok({ success: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(err.code)
    )
      return apiError('CONFLICT', 'Connection changed. Refresh and try again.');
    return handleUnknown(err);
  }
}
