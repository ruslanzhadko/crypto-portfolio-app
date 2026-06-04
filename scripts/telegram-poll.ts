/**
 * Локальний Telegram polling — альтернатива webhook для розробки.
 * Запуск: npx tsx scripts/telegram-poll.ts
 *
 * Бот відповідає на /start, /id, /help повідомленнями з Chat ID.
 * Не потребує ngrok чи будь-якого тунелю.
 */

import 'dotenv/config';
import axios from 'axios';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

if (!TOKEN) {
  console.error('[poll] TELEGRAM_BOT_TOKEN не встановлено в .env');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

interface TelegramMessage {
  chat: { id: number };
  from?: { first_name?: string };
  text?: string;
}
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  await axios.post(`${API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

function escapeHtml(text: string): string {
  return text.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;');
}

function buildStartReply(chatId: number, firstName?: string): string {
  const settingsUrl = `${APP_URL}/settings`;
  const greeting = firstName ? `Привіт, ${escapeHtml(firstName)}!` : 'Привіт!';
  return [
    `👋 ${greeting}`,
    '',
    '🤖 Це бот <b>CryptoPortfolio</b> — надсилає сповіщення про цінові аномалії.',
    '',
    '📋 Ваш <b>Telegram Chat ID</b>:',
    `<code>${chatId}</code>`,
    '',
    '📌 Скопіюйте ID і вставте у налаштуваннях профілю:',
    `👉 <a href="${settingsUrl}">${settingsUrl}</a>`,
  ].join('\n');
}

async function handleMessage(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? '';

  if (text === '/start' || text.startsWith('/start ')) {
    await sendMessage(chatId, buildStartReply(chatId, msg.from?.first_name));
  } else if (text === '/id' || text === '/chatid') {
    await sendMessage(chatId, `Ваш Chat ID: <code>${chatId}</code>`);
  } else if (text === '/help') {
    await sendMessage(chatId, '/start — Chat ID + інструкція\n/id — тільки Chat ID');
  }
}

async function poll(): Promise<void> {
  let offset = 0;
  console.log('[poll] Старт. Надішліть /start боту в Telegram.');

  // Скидаємо webhook якщо він був зареєстрований раніше
  await axios.post(`${API}/deleteWebhook`).catch(() => {});

  while (true) {
    try {
      const { data } = await axios.get<{ ok: boolean; result: TelegramUpdate[] }>(
        `${API}/getUpdates`,
        { params: { offset, timeout: 30 }, timeout: 35000 },
      );

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) {
          const { chat, text } = update.message;
          console.log(`[poll] Повідомлення від chat_id=${chat.id}: ${text ?? '(без тексту)'}`);
          await handleMessage(update.message).catch((err: unknown) => {
            console.error('[poll] Помилка відповіді:', err);
          });
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') continue; // timeout — норма
      console.error('[poll] Помилка getUpdates:', err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

void poll();
