/**
 * Локальний планувальник на основі node-cron для розробки.
 * Запуск: `npm run cron:local`
 *
 * У production цю функцію виконує Vercel Cron Jobs (див. vercel.json).
 */
import cron from 'node-cron';
import { runPriceUpdater } from './price-updater';

const SCHEDULE = process.env.CRON_SCHEDULE ?? '* * * * *';

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
  } catch (err) {
    console.error('[cron] Помилка:', err);
  } finally {
    running = false;
  }
});
