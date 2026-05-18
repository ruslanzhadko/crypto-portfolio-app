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
}

async function sendMessage(opts: TelegramSendOptions): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не встановлено');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const { data } = await axios.post<TelegramResponse>(url, {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode ?? 'HTML',
    disable_web_page_preview: true,
  }, { timeout: 10000 });

  if (!data.ok) {
    throw new TelegramError(data.description ?? 'Telegram API повернув помилку');
  }
}

export interface PriceAlertPayload {
  tokenSymbol: string;
  tokenName: string;
  deltaPercent: number;
  price: number;
  intervalMinutes: number;
}

export function formatPriceAlert(payload: PriceAlertPayload): string {
  const direction = payload.deltaPercent > 0 ? '📈' : '📉';
  const sign = payload.deltaPercent > 0 ? '+' : '';
  const intervalLabel =
    payload.intervalMinutes >= 60
      ? `${(payload.intervalMinutes / 60).toFixed(1).replace(/\.0$/, '')} год`
      : `${payload.intervalMinutes} хв`;

  return [
    `🚨 <b>Цінова аномалія: ${escapeHtml(payload.tokenSymbol)}</b>`,
    '',
    `${direction} Зміна: <b>${sign}${payload.deltaPercent.toFixed(2)}%</b> за ${escapeHtml(intervalLabel)}`,
    `💰 Поточна ціна: <b>$${formatPrice(payload.price)}</b>`,
    `📊 Токен: ${escapeHtml(payload.tokenName)}`,
    '',
    `⏱ ${new Date().toLocaleString('uk-UA')}`,
  ].join('\n');
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendPriceAlert(
  chatId: string,
  payload: PriceAlertPayload,
): Promise<void> {
  const text = formatPriceAlert(payload);
  await sendMessage({ chatId, text, parseMode: 'HTML' });
}

export async function sendTestMessage(chatId: string): Promise<void> {
  await sendMessage({
    chatId,
    text: '✅ <b>CryptoPortfolio</b>\n\nЦе тестове повідомлення. Ваш Telegram налаштовано правильно.',
    parseMode: 'HTML',
  });
}
