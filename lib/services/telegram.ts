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
  const direction = payload.deltaPercent > 0 ? '\u{1F4C8}' : '\u{1F4C9}';
  const sign = payload.deltaPercent > 0 ? '+' : '';
  const intervalLabel =
    payload.intervalMinutes >= 60
      ? `${(payload.intervalMinutes / 60).toFixed(1).replace(/\.0$/, '')} год`
      : `${payload.intervalMinutes} хв`;

  const prevPrice = payload.price / (1 + payload.deltaPercent / 100);

  return [
    `\u{1F6A8} <b>Цінова аномалія: ${escapeHtml(payload.tokenSymbol)}</b>`,
    '',
    `${direction} Зміна: <b>${sign}${payload.deltaPercent.toFixed(2)}%</b> за ${escapeHtml(intervalLabel)}`,
    `\u{1F4B0} Ціна зараз:  <b>$${formatPrice(payload.price)}</b>`,
    `\u{1F4CC} Ціна раніше: <b>$${formatPrice(prevPrice)}</b>`,
    '',
    `\u{23F1} ${new Date().toLocaleString('uk-UA')}`,
  ].join('\n');
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;');
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
  const label = payload.direction === 'UP' ? 'вище' : 'нижче';

  return [
    `\u{1F3AF} <b>Цільова ціна досягнута: ${escapeHtml(payload.tokenSymbol)}</b>`,
    '',
    `${icon} Ціна пішла <b>${label}</b> позначки $${formatPrice(payload.targetPrice)}`,
    `\u{1F4B0} Поточна ціна: <b>$${formatPrice(payload.currentPrice)}</b>`,
    `\u{1F4CA} Токен: ${escapeHtml(payload.tokenName)}`,
    '',
    `\u{23F1} ${new Date().toLocaleString('uk-UA')}`,
    '',
    '<i>Тригер деактивовано після спрацювання.</i>',
  ].join('\n');
}

export async function sendPriceTargetAlert(
  chatId: string,
  payload: PriceTargetPayload,
): Promise<void> {
  const text = formatPriceTargetAlert(payload);
  await sendMessage({ chatId, text, parseMode: 'HTML' });
}

export async function sendTestMessage(chatId: string): Promise<void> {
  await sendMessage({
    chatId,
    text: '\u{2705} <b>CryptoPortfolio</b>\n\nЦе тестове повідомлення. Ваш Telegram налаштовано правильно.',
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

export async function setWebhook(webhookUrl: string, secretToken: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не встановлено');

  const { data } = await axios.post<TelegramResponse>(
    `https://api.telegram.org/bot${token}/setWebhook`,
    { url: webhookUrl, secret_token: secretToken, allowed_updates: ['message'] },
    { timeout: 10000 },
  );
  if (!data.ok) throw new TelegramError(data.description ?? 'setWebhook failed');
}

export async function getWebhookInfo(): Promise<WebhookInfo> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не встановлено');

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

export async function replyToUpdate(chatId: number, text: string): Promise<void> {
  await sendMessage({ chatId: String(chatId), text, parseMode: 'HTML' });
}
