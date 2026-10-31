import { type NextRequest, NextResponse } from 'next/server';
import {
  answerCallback,
  editWithKeyboard,
  replyToUpdate,
  sendWithKeyboard,
} from '@/lib/services/telegram';
import {
  chatUser,
  commandOf,
  NOT_LINKED,
  parseStatsCallback,
  PERIOD_COMMANDS,
  statsKeyboard,
  statsMessage,
} from '@/lib/telegram/stats-bot';
import {
  formatPositionsMessage,
  POSITIONS_COMMAND,
  positionsKeyboard,
  positionsSnapshot,
  REFRESH_CALLBACK,
  snapshotStale,
  workerOnline,
} from '@/lib/telegram/positions-bot';
import { positionViewCooling, requestPositionView } from '@/lib/positions/view-requests';

export const dynamic = 'force-dynamic';

// Telegram update shape (only fields we need)
interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { first_name?: string };
    text?: string;
  };
  /** A press on an inline button under one of the bot's messages. */
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

const siteUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || null;

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get('x-telegram-bot-api-secret-token') === secret;
}

function buildStartReply(chatId: number, firstName?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const settingsUrl = appUrl ? `${appUrl}/settings` : '/settings';
  const greeting = firstName ? `Привет, ${escapeHtml(firstName)}!` : 'Привет!';

  return [
    `\u{1F44B} ${greeting}`,
    '',
    `\u{1F916} Это бот <b>CryptoPortfolio</b> — отправляет уведомления о ценовых аномалиях ваших токенов.`,
    '',
    `\u{1F4CB} Ваш <b>Telegram Chat ID</b>:`,
    `<code>${chatId}</code>`,
    '',
    `\u{1F4CC} Скопируйте этот ID и вставьте в настройках профиля:`,
    `\u{1F449} <a href="${settingsUrl}">${settingsUrl}</a>`,
    '',
    'После этого создайте ценовые триггеры на странице <b>Уведомления</b> и бот начнёт отправлять алерты сюда.',
    '',
    '\u{1F4C8} Открытые позиции — /positions',
    '\u{1F4CA} Статистика торговли — /stats',
  ].join('\n');
}

/** A snapshot right away; when it is old, the worker edits this one message with fresh figures. */
async function sendPositions(chatId: number, userId: string): Promise<void> {
  const snapshot = await positionsSnapshot(userId);
  const refresh =
    snapshotStale(snapshot) && !(await positionViewCooling(chatId)) && (await workerOnline());
  const messageId = await sendWithKeyboard(
    chatId,
    formatPositionsMessage(snapshot, { refreshing: refresh }),
    positionsKeyboard(siteUrl()),
  );
  if (refresh && messageId !== null) await requestPositionView({ userId, chatId, messageId });
}

/** The button: the worker redraws the message; without a worker, the stored data with its time. */
async function refreshPositions(callbackId: string, chatId: number, messageId: number): Promise<void> {
  if (await positionViewCooling(chatId)) return answerCallback(callbackId, 'Уже обновляю, подождите несколько секунд');
  const user = await chatUser(chatId);
  if (!user) return answerCallback(callbackId, NOT_LINKED.slice(0, 190));
  if ((await workerOnline()) && (await requestPositionView({ userId: user.id, chatId, messageId })))
    return answerCallback(callbackId, 'Обновляю, это займёт до 15 секунд');
  await editWithKeyboard(
    chatId,
    messageId,
    formatPositionsMessage(await positionsSnapshot(user.id)),
    positionsKeyboard(siteUrl()),
  );
  await answerCallback(callbackId);
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

  // Period buttons under a statistics message: redraw it in place.
  const callback = update.callback_query;
  if (callback?.data === REFRESH_CALLBACK && callback.message) {
    try {
      await refreshPositions(callback.id, callback.message.chat.id, callback.message.message_id);
    } catch (err) {
      console.error('[telegram/webhook] positions refresh failed', err);
    }
    return NextResponse.json({ ok: true });
  }
  if (callback) {
    const period = parseStatsCallback(callback.data);
    const target = callback.message;
    try {
      const user = period && target ? await chatUser(target.chat.id) : null;
      if (period && target && user)
        await editWithKeyboard(
          target.chat.id,
          target.message_id,
          await statsMessage(user.id, period),
          statsKeyboard(period, siteUrl()),
        );
      await answerCallback(callback.id, period && target && !user ? NOT_LINKED.slice(0, 190) : undefined);
    } catch (err) {
      console.error('[telegram/webhook] callback failed', err);
    }
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.chat?.id) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text?.trim() ?? '';

  console.log(`[telegram/webhook] chat_id=${chatId} text="${text}"`);

  if (commandOf(text) === POSITIONS_COMMAND) {
    try {
      const user = await chatUser(chatId);
      if (user) await sendPositions(chatId, user.id);
      else await replyToUpdate(chatId, NOT_LINKED);
    } catch (err) {
      console.error(`[telegram/webhook] positions failed chat_id=${chatId}`, err);
    }
    return NextResponse.json({ ok: true });
  }

  const period = PERIOD_COMMANDS[commandOf(text)];
  if (period) {
    try {
      const user = await chatUser(chatId);
      if (user) await sendWithKeyboard(chatId, await statsMessage(user.id, period), statsKeyboard(period, siteUrl()));
      else await replyToUpdate(chatId, NOT_LINKED);
    } catch (err) {
      console.error(`[telegram/webhook] stats failed chat_id=${chatId}`, err);
    }
    return NextResponse.json({ ok: true });
  }

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
        '\u{1F4D6} <b>Команды:</b>',
        '/positions — открытые позиции',
        '/stats — статистика торговли (кнопки: сегодня, 7 дней, 30 дней, всё)',
        '/today — итог закрытых сделок за сегодня',
        '/week — за 7 дней',
        '/month — за 30 дней',
        '/all — за всё время',
        '/start — показать Chat ID и инструкцию',
        '/id — только ваш Chat ID',
      ].join('\n'),
    ).catch((err) => console.error(`[telegram/webhook] reply failed chat_id=${chatId}`, err));
  } else {
    console.log(`[telegram/webhook] unhandled command chat_id=${chatId} text="${text}"`);
  }

  return NextResponse.json({ ok: true });
}
