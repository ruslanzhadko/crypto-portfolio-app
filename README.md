# CryptoPortfolio

Моніторинг крипто-портфеля: Next.js 14 (App Router), TypeScript, Prisma, NextAuth.js (Auth.js v5), Tailwind.

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
   `CRON_SECRET`, `MORALIS_API_KEY`, `ANKR_API_KEY`, `HELIUS_API_KEY`, `SOLANA_RPC_URL`,
   `COINGECKO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.
   `NEXTAUTH_URL` і `NEXT_PUBLIC_APP_URL` = `https://<your-app>.vercel.app`.
3. **Білд.** `npm run build` = `prisma generate && next build`; `postinstall` теж генерує клієнт.
4. **Перевірка.** `GET /api/health` повертає `{ status: "ok", db: "up" }` (503, якщо БД недоступна).

### Cron (оновлення цін / тригери / снапшоти)

На проді фон виконує **Vercel Cron** через HTTP-ендпоінт `GET /api/cron/update-prices`
(захищений `Authorization: Bearer ${CRON_SECRET}`). Розклад — у `vercel.json` (`*/15 * * * *`).
Та сама логіка (`lib/cron/price-updater.ts`) використовується і локальним `cron:local`.

> ⚠️ **Hobby-план Vercel виконує cron лише раз на добу** — заявлений `*/15` фактично
> спрацює раз на день. Для частих перевірок потрібен **Pro-план** або зовнішній планувальник
> (напр. [cron-job.org](https://cron-job.org)), що раз на 15 хв б'є по
> `https://<your-app>.vercel.app/api/cron/update-prices` із заголовком
> `Authorization: Bearer <CRON_SECRET>`.

> ℹ️ `node-cron`/`lib/cron/scheduler.ts` — лише для локалки; на Vercel (serverless) постійний
> процес не запускається, і це нормально.
