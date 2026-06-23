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
  return text.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;');
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

  // Емодзі — через \u{...} code-point escape (ASCII у файлі), щоб кодування/збірка
  // не псували 4-байтні символи (баг: 🤖/📌 надсилались як літеральний \uXXXX-текст).
  return [
    `\u{1F44B} ${greeting}`,
    '',
    `\u{1F916} Це бот <b>CryptoPortfolio</b> — надсилає сповіщення про цінові аномалії ваших токенів.`,
    '',
    `\u{1F4CB} Ваш <b>Telegram Chat ID</b>:`,
    `<code>${chatId}</code>`,
    '',
    `\u{1F4CC} Скопіюйте цей ID і вставте у налаштуваннях профілю:`,
    `\u{1F449} <a href="${settingsUrl}">${settingsUrl}</a>`,
    '',
    'Після цього створіть цінові тригери на сторінці <b>Сповіщення</b> і бот почне надсилати алерти сюди.',
  ].join('\n');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    console.warn('[telegram/webhook] unauthorized request — wrong or missing secret');
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    console.error('[telegram/webhook] failed to parse update body');
    return NextResponse.json({ ok: true });
  }

  console.log(`[telegram/webhook] update_id=${update.update_id} has_message=${!!update.message}`);

  const message = update.message;
  if (!message?.chat?.id) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text?.trim() ?? '';

  console.log(`[telegram/webhook] chat_id=${chatId} text="${text}"`);

  if (text === '/start' || text.startsWith('/start ')) {
    await replyToUpdate(chatId, buildStartReply(chatId, message.from?.first_name)).catch(
      (err) => console.error(`[telegram/webhook] reply failed chat_id=${chatId}`, err),
    );
  } else if (text === '/id' || text === '/chatid') {
    await replyToUpdate(chatId, `Ваш Chat ID: <code>${chatId}</code>`).catch(
      (err) => console.error(`[telegram/webhook] reply failed chat_id=${chatId}`, err),
    );
  } else if (text === '/help') {
    await replyToUpdate(
      chatId,
      [
        '📖 <b>Команди:</b>',
        '/start — показати Chat ID та інструкцію',
        '/id — тільки ваш Chat ID',
      ].join('\n'),
    ).catch((err) => console.error(`[telegram/webhook] reply failed chat_id=${chatId}`, err));
  } else {
    console.log(`[telegram/webhook] unhandled command chat_id=${chatId} text="${text}"`);
  }

  return NextResponse.json({ ok: true });
}
