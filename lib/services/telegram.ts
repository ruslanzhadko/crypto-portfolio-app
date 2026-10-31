import axios from 'axios';

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramError';
  }
}

interface TelegramSendOptions {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: { message_id?: number };
}

async function sendMessage(opts: TelegramSendOptions): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не установлен');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  let data: TelegramResponse;
  try {
    ({ data } = await axios.post<TelegramResponse>(
      url,
      {
        chat_id: opts.chatId,
        text: opts.text,
        parse_mode: opts.parseMode ?? 'HTML',
        disable_web_page_preview: true,
      },
      { timeout: 10000 },
    ));
  } catch (error) {
    // Axios rejects Bot API 4xx/5xx before returning the body. Do not propagate
    // request configuration (which contains the bot token) to API responses.
    if (axios.isAxiosError(error)) {
      const code = error.response?.status;
      throw new TelegramError(
        code === 403 || code === 400
          ? 'Откройте бота, нажмите Старт и убедитесь, что он не заблокирован.'
          : 'Telegram временно недоступен. Повторите попытку позже.',
      );
    }
    throw new TelegramError(
      'Telegram временно недоступен. Повторите попытку позже.',
    );
  }

  if (!data.ok) {
    throw new TelegramError(data.description ?? 'Telegram API вернул ошибку');
  }
  return data.result?.message_id ?? null;
}

export interface PriceAlertPayload {
  tokenSymbol: string;
  tokenName: string;
  deltaPercent: number;
  price: number;
  intervalMinutes: number;
}

export function formatPriceAlert(payload: PriceAlertPayload): string {
  const direction = payload.deltaPercent > 0 ? '\u{1F4C8}' : '\u{1F4C9}';
  const sign = payload.deltaPercent > 0 ? '+' : '';
  const intervalLabel =
    payload.intervalMinutes >= 60
      ? `${(payload.intervalMinutes / 60).toFixed(1).replace(/\.0$/, '')} ч`
      : `${payload.intervalMinutes} мин`;

  const prevPrice = payload.price / (1 + payload.deltaPercent / 100);

  return [
    `\u{1F6A8} <b>Ценовая аномалия: ${escapeHtml(payload.tokenSymbol)}</b>`,
    '',
    `${direction} Изменение: <b>${sign}${payload.deltaPercent.toFixed(2)}%</b> за ${escapeHtml(intervalLabel)}`,
    `\u{1F4B0} Цена сейчас:  <b>$${formatPrice(payload.price)}</b>`,
    `\u{1F4CC} Цена ранее:   <b>$${formatPrice(prevPrice)}</b>`,
    '',
    `\u{23F1} ${formatKyivTime()}`,
  ].join('\n');
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

export function formatKyivTime(date = new Date()): string {
  return date.toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export async function sendPriceAlert(
  chatId: string,
  payload: PriceAlertPayload,
): Promise<void> {
  const text = formatPriceAlert(payload);
  await sendMessage({ chatId, text, parseMode: 'HTML' });
}

export interface PriceTargetPayload {
  tokenSymbol: string;
  tokenName: string;
  targetPrice: number;
  currentPrice: number;
  direction: 'UP' | 'DOWN';
}

export function formatPriceTargetAlert(payload: PriceTargetPayload): string {
  const icon = payload.direction === 'UP' ? '\u{1F4C8}' : '\u{1F4C9}';
  const label = payload.direction === 'UP' ? 'выше' : 'ниже';

  return [
    `\u{1F3AF} <b>Целевая цена достигнута: ${escapeHtml(payload.tokenSymbol)}</b>`,
    '',
    `${icon} Цена пошла <b>${label}</b> отметки $${formatPrice(payload.targetPrice)}`,
    `\u{1F4B0} Текущая цена: <b>$${formatPrice(payload.currentPrice)}</b>`,
    `\u{1F4CA} Токен: ${escapeHtml(payload.tokenName)}`,
    '',
    `\u{23F1} ${formatKyivTime()}`,
    '',
    '<i>Триггер деактивирован после срабатывания.</i>',
  ].join('\n');
}

export async function sendPriceTargetAlert(
  chatId: string,
  payload: PriceTargetPayload,
): Promise<void> {
  const text = formatPriceTargetAlert(payload);
  await sendMessage({ chatId, text, parseMode: 'HTML' });
}

/** Sends a ready HTML message (position alerts format their own text). */
/** Returns the message id, for a later edit. */
export async function sendTelegramHtml(chatId: string, text: string): Promise<number | null> {
  return sendMessage({ chatId, text, parseMode: 'HTML' });
}

/** Replaces the text of a sent message; the same text again is not an error. */
export async function editTelegramHtml(chatId: string, messageId: number, text: string): Promise<void> {
  try {
    await callBot('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    if (error instanceof TelegramError && /not modified/i.test(error.message)) return;
    throw error;
  }
}

export async function sendTestMessage(chatId: string): Promise<void> {
  await sendMessage({
    chatId,
    text: '\u{2705} <b>CryptoPortfolio</b>\n\nЭто тестовое сообщение. Ваш Telegram настроен правильно.',
    parseMode: 'HTML',
  });
}

// ─────────────────────────────────────────
// Webhook management
// ─────────────────────────────────────────

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export async function setWebhook(
  webhookUrl: string,
  secretToken: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не установлен');

  const { data } = await axios.post<TelegramResponse>(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      url: webhookUrl,
      secret_token: secretToken,
      // Button presses under bot messages (statistics periods) arrive as callback queries.
      allowed_updates: ['message', 'callback_query'],
    },
    { timeout: 10000 },
  );
  if (!data.ok)
    throw new TelegramError(data.description ?? 'setWebhook failed');
  // The command menu next to the input field; a failure here does not undo the webhook.
  await callBot('setMyCommands', { commands: BOT_COMMANDS }).catch(() => {});
}

/** Commands shown in the bot's menu. */
export const BOT_COMMANDS = [
  { command: 'positions', description: 'Открытые позиции' },
  { command: 'stats', description: 'Статистика торговли с кнопками периодов' },
  { command: 'today', description: 'Итог закрытых сделок за сегодня' },
  { command: 'week', description: 'Статистика за 7 дней' },
  { command: 'month', description: 'Статистика за 30 дней' },
  { command: 'help', description: 'Список команд' },
];

export type InlineKeyboard = { text: string; callback_data?: string; url?: string }[][];

/** Any Bot API method with a JSON body; the token never leaves this module, errors carry no config. */
export async function callBot(method: string, body: Record<string, unknown>): Promise<TelegramResponse['result']> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не установлен');
  let data: TelegramResponse;
  try {
    ({ data } = await axios.post<TelegramResponse>(`https://api.telegram.org/bot${token}/${method}`, body, {
      timeout: 10000,
    }));
  } catch (error) {
    const description = axios.isAxiosError(error)
      ? (error.response?.data as TelegramResponse | undefined)?.description
      : undefined;
    throw new TelegramError(description ?? 'Telegram временно недоступен. Повторите попытку позже.');
  }
  if (!data.ok) throw new TelegramError(data.description ?? `${method} failed`);
  return data.result;
}

/** Returns the message id, for a later edit. */
export async function sendWithKeyboard(chatId: number, text: string, keyboard: InlineKeyboard): Promise<number | null> {
  const result = await callBot('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  });
  return result?.message_id ?? null;
}

/** Replaces a bot message in place; pressing the active button again is not an error. */
export async function editWithKeyboard(
  chatId: number,
  messageId: number,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> {
  try {
    await callBot('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (error) {
    if (error instanceof TelegramError && /not modified/i.test(error.message)) return;
    throw error;
  }
}

/** Stops the loading clock on the pressed button. */
export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await callBot('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

export async function getWebhookInfo(): Promise<WebhookInfo> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не установлен');

  const { data } = await axios.get<{ ok: boolean; result: WebhookInfo }>(
    `https://api.telegram.org/bot${token}/getWebhookInfo`,
    { timeout: 10000 },
  );
  if (!data.ok) throw new TelegramError('getWebhookInfo failed');
  return data.result;
}

// ─────────────────────────────────────────
// Bot reply (used by webhook handler)
// ─────────────────────────────────────────

export async function replyToUpdate(
  chatId: number,
  text: string,
): Promise<void> {
  await sendMessage({ chatId: String(chatId), text, parseMode: 'HTML' });
}
