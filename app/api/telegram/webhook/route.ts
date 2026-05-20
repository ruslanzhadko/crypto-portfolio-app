import { type NextRequest, NextResponse } from 'next/server';
import { replyToUpdate } from '@/lib/services/telegram';

export const dynamic = 'force-dynamic';

// Telegram update shape (only fields we need)
interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { first_name?: string };
    text?: string;
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get('x-telegram-bot-api-secret-token') === secret;
}

function buildStartReply(chatId: number, firstName?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const settingsUrl = appUrl ? `${appUrl}/settings` : '/settings';
  const greeting = firstName ? `Привіт, ${escapeHtml(firstName)}!` : 'Привіт!';

  return [
    `👋 ${greeting}`,
    '',
    '🤖 Це бот <b>CryptoPortfolio</b> — надсилає сповіщення про цінові аномалії ваших токенів.',
    '',
    `📋 Ваш <b>Telegram Chat ID</b>:`,
    `<code>${chatId}</code>`,
    '',
    '📌 Скопіюйте цей ID і вставте у налаштуваннях профілю:',
    `👉 <a href="${settingsUrl}">${settingsUrl}</a>`,
    '',
    'Після цього створіть цінові тригери на сторінці <b>Сповіщення</b> і бот почне надсилати алерти сюди.',
  ].join('\n');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    // Return 200 to prevent Telegram from retrying — the secret is simply wrong
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text?.trim() ?? '';

  if (text === '/start' || text.startsWith('/start ')) {
    await replyToUpdate(chatId, buildStartReply(chatId, message.from?.first_name)).catch(
      () => {},
    );
  } else if (text === '/id' || text === '/chatid') {
    await replyToUpdate(chatId, `Ваш Chat ID: <code>${chatId}</code>`).catch(() => {});
  } else if (text === '/help') {
    await replyToUpdate(
      chatId,
      [
        '📖 <b>Команди:</b>',
        '/start — показати Chat ID та інструкцію',
        '/id — тільки ваш Chat ID',
      ].join('\n'),
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
