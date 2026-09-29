/**
 * Локальний планувальник на основі node-cron для розробки.
 * У production цю функцію виконує Vercel Cron Jobs (див. vercel.json).
 */
import cron from 'node-cron';
import { runPriceUpdater, runTriggerCheck } from './price-updater';

const SCHEDULE = process.env.CRON_SCHEDULE ?? '* * * * *';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('[cron] DATABASE_URL не заданий');
}

const hostname = new URL(databaseUrl).hostname.toLowerCase();
if (
  (hostname === 'neon.tech' || hostname.endsWith('.neon.tech')) &&
  process.env.ALLOW_REMOTE_CRON !== 'true'
) {
  throw new Error(
    '[cron] Локальний cron для Neon вимкнено. Використовуйте локальний Postgres або явно задайте ALLOW_REMOTE_CRON=true.',
  );
}

console.log(`[cron] Стартую локальний планувальник з розкладом "${SCHEDULE}"`);

let running = false;
cron.schedule(SCHEDULE, async () => {
  if (running) {
    console.log('[cron] Попередній запуск ще триває — пропускаю');
    return;
  }
  running = true;
  try {
    const result = await runPriceUpdater();
    console.log(`[cron] ${new Date().toLocaleTimeString('uk-UA')} Виконано:`, result);
    const triggers = await runTriggerCheck();
    console.log('[cron] Перевірка тригерів:', triggers);
  } catch (err) {
    console.error('[cron] Помилка:', err);
  } finally {
    running = false;
  }
});
