import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { sendTestMessage, TelegramError } from '@/lib/services/telegram';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const user = await prisma.user.findUnique({
      where: { id: guard.user.id },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) {
      return apiError('BAD_REQUEST', 'Telegram Chat ID не встановлено');
    }

    try {
      await sendTestMessage(user.telegramChatId);
      return ok({ success: true });
    } catch (err) {
      if (err instanceof TelegramError) {
        return apiError('UPSTREAM_ERROR', err.message);
      }
      throw err;
    }
  } catch (err) {
    return handleUnknown(err);
  }
}
