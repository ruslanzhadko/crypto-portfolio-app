# CryptoPortfolio

Моніторинг крипто-портфеля: Next.js 14 (App Router), TypeScript, Prisma, NextAuth.js (Auth.js v5), Tailwind.

## Підтримувані мережі

10 мереж: Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche,
X Layer, **Robinhood** (9 EVM) та Solana. Для Robinhood використовується
та сама EVM-адреса — додайте EVM-гаманець або синхронізуйте наявний.

Robinhood mainnet: chain ID `4663` (`0x1237`), нативна монета ETH,
[explorer](https://robinhoodchain.blockscout.com),
[офіційні параметри мережі](https://docs.robinhood.com/chain/connecting/).
Баланси ETH та ERC-20 отримуються окремо через Blockscout з пагінацією.
Без ключа використовується публічний API; опційний `ROBINHOOD_BLOCKSCOUT_API_KEY`
вмикає Blockscout PRO API. У разі збою попередні баланси цієї мережі зберігаються.
Публічний API може блокувати серверні запити (HTTP 403). Для production додайте
ключ із [Blockscout Developer Portal](https://dev.blockscout.com) у змінні середовища
Vercel як `ROBINHOOD_BLOCKSCOUT_API_KEY` та виконайте redeploy. Без доступного API
інтерфейс повідомляє, що дані Robinhood не оновлено.

Історію Robinhood відкриває перемикач над транзакціями гаманця: нативні транзакції
та ERC-20 transfer-події показуються окремими записами з посиланнями на explorer.
Свопи Robinhood поки не класифікуються. ETH оцінюється через Binance/CoinGecko;
ціни ERC-20 надходять із Blockscout при синхронізації балансів. Токени без ціни
можуть приховуватися наявним фільтром спаму. Логотип: `public/robinhood-logo.png`.

## Локальний запуск

```bash
npm install
cp .env.example .env        # заповни змінні
npm run db:push             # або db:migrate
npm run db:seed             # демо-дані (опційно)
npm run dev
```

Фонове оновлення цін локально — окремий процес на node-cron:

```bash
npm run cron:local          # читає розклад із CRON_SCHEDULE (дефолт: щохвилини)
```

## Деплой на Vercel + Neon

1. **Neon Postgres.** Створи базу. У змінні Vercel додай:
   - `DATABASE_URL` — **pooled** рядок (хост із `-pooler`, `?sslmode=require&pgbouncer=true`);
   - `DIRECT_URL` — **direct** рядок (без `-pooler`), потрібен Prisma для міграцій.
2. **Змінні середовища** (Project → Settings → Environment Variables) — повний перелік у `.env.example`:
   `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `NEXTAUTH_URL`,
   `CRON_SECRET`, `ANKR_API_KEY`, `HELIUS_API_KEY`, `SOLANA_RPC_URL`,
   `COINGECKO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.
   `NEXTAUTH_URL` і `NEXT_PUBLIC_APP_URL` = `https://<your-app>.vercel.app`.
3. **Білд.** `npm run build` = `prisma generate && next build`; `postinstall` теж генерує клієнт.
4. **Перевірка.** `GET /api/health` повертає `{ status: "ok", db: "up" }` (503, якщо БД недоступна).

### Cron (оновлення цін / тригери / снапшоти)

Фон має два захищені HTTP-ендпоінти: `GET /api/cron/update-prices` для синхронізації
балансів, цін і знімків та `GET /api/cron/check-triggers` для перевірки цінових
тригерів і Telegram-сповіщень. Обидва вимагають `Authorization: Bearer ${CRON_SECRET}`;
без налаштованого `CRON_SECRET` вони відхиляють запити. Локальний `cron:local`
виконує обидва кроки.

Два джерела викликів цього ендпоінта:
1. **Vercel Cron** (`vercel.json`, `0 6 * * *` та `5 6 * * *`) — штатний планувальник, раз на добу.
   На Hobby-плані Vercel дозволяє лише добову частоту, тому це резервний/демонстраційний канал.
2. **Зовнішній планувальник** ([cron-job.org](https://cron-job.org)) — основний для частих
   оновлень: налаштуй окремі GET-завдання для `/api/cron/update-prices` та
   `/api/cron/check-triggers` із заголовком `Authorization: Bearer <CRON_SECRET>`.
   Без другого завдання тригери перевірятимуться лише раз на добу.

Показник `/api/portfolio/pnl` — зміна вартості між знімками, а не прибуток від
інвестиції: внесення й виведення коштів окремо не враховуються.

> ⚠️ **Hobby-план Vercel виконує cron лише раз на добу.** Розклад частіше за добовий
> (`*/15`, `0 * * * *`) Vercel **відхиляє на білді**. Для оновлення кожні 15 хв
> використовуй зовнішній планувальник (вище) або перейди на **Pro**.

> ℹ️ `node-cron`/`lib/cron/scheduler.ts` — лише для локалки; на Vercel (serverless) постійний
> процес не запускається, і це нормально.
