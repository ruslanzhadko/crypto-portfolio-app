import { handleUnknown, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/auth-guard';
import { getWebhookInfo, setWebhook, TelegramError } from '@/lib/services/telegram';
import { apiError } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const info = await getWebhookInfo();
    return ok({ webhook: info });
  } catch (err) {
    if (err instanceof TelegramError) {
      return apiError('UPSTREAM_ERROR', err.message);
    }
    return handleUnknown(err);
  }
}

export async function POST() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) return apiError('BAD_REQUEST', 'NEXT_PUBLIC_APP_URL не встановлено');

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) return apiError('BAD_REQUEST', 'TELEGRAM_WEBHOOK_SECRET не встановлено');

    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    await setWebhook(webhookUrl, secret);
    return ok({ registered: true, url: webhookUrl });
  } catch (err) {
    if (err instanceof TelegramError) {
      return apiError('UPSTREAM_ERROR', err.message);
    }
    return handleUnknown(err);
  }
}
