# CryptoPortfolio

Моніторинг крипто-портфеля: Next.js 14 (App Router), TypeScript, Prisma, NextAuth.js (Auth.js v5), Tailwind.

## Криптострічка з Telegram

Розділ `/feed` читає публічні канали через окремий Telegram-акаунт.
Постійний listener треба розгортати як worker на Railway, Render, Fly.io або VPS,
а не як Vercel Function.

1. Створіть Telegram API credentials на `https://my.telegram.org`.
2. Вкажіть `TELEGRAM_API_ID` та `TELEGRAM_API_HASH` локально.
3. Один раз запустіть `npm run telegram:feed:auth` і збережіть результат
   як секрет `TELEGRAM_USER_SESSION`.
4. Застосуйте схему бази: `npm run db:push`.
5. Запустіть збір публікацій: `npm run telegram:feed`.

Worker завантажує 30 останніх дописів кожного каналу, а потім миттєво зберігає
нові. Фото одного Telegram-альбому показуються каруселлю в одному дописі.
Після оновлення worker відновлює групи для раніше збережених фото; цей крок
також можна запустити окремо через `npm run telegram:feed:local -- --backfill-albums`.
`TELEGRAM_USER_SESSION` не можна додавати в Git — це секрет доступу до акаунта.
Список активних каналів worker перечитує з БД кожні 30 хвилин, тому зміни списку
застосовуються із затримкою до 30 хвилин; нові дописи вже підключених каналів
надходять одразу.

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

### Hyperliquid / HyperEVM

HyperCore (біржові spot і perpetuals баланси) читається через Hyperliquid Info API.
HyperEVM — окрема EVM-мережа з chain ID `999`: нативний HYPE читається через
[офіційний RPC](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm),
ERC-20 контракти знаходяться через історію трансферів
[Etherscan API V2](https://hyperevmscan.io/api) і перевіряються через `eth_call`.
Для цього потрібен `ETHERSCAN_API_KEY` у Vercel Production Environment Variables
і нове розгортання. Ключ створюється в [Etherscan](https://etherscan.io/myapikey);
у репозиторій його не додавати. Той самий API дає історію нативних і ERC-20 транзакцій.
Якщо API недоступний або ключ не заданий, попередні баланси HyperEVM зберігаються.
Для адрес із 5000 і більше ERC-20 трансферів за всю історію синхронізація зупиняється
без видалення попередніх балансів: для них потрібен окремий індексатор або тариф
з endpoint для всіх поточних holdings.

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
npm run cron:local          # лише для локального Postgres; розклад із CRON_SCHEDULE
```

`cron:local` завантажує `.env` і відмовляється запускатися з Neon-базою, щоб
щохвилинний розклад випадково не тримав production compute активним. Для
свідомого запуску з Neon потрібно явно задати `ALLOW_REMOTE_CRON=true`.

## Деплой на Vercel + Neon

1. **Neon Postgres.** Створи базу. У змінні Vercel додай:
   - `DATABASE_URL` — **pooled** рядок (хост із `-pooler`, `?sslmode=require&pgbouncer=true`);
   - `DIRECT_URL` — **direct** рядок (без `-pooler`), потрібен Prisma для міграцій.
2. **Змінні середовища** (Project → Settings → Environment Variables) — повний перелік у `.env.example`:
   `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `NEXTAUTH_URL`,
   `CRON_SECRET`, `ANKR_API_KEY`, `HELIUS_API_KEY`, `SOLANA_RPC_URL`, `ETHERSCAN_API_KEY`,
   `COINGECKO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.
   `NEXTAUTH_URL` і `NEXT_PUBLIC_APP_URL` = `https://<your-app>.vercel.app`.
3. **Білд.** `npm run build` = `prisma generate && next build`; `postinstall` теж генерує клієнт.
4. **Перевірка.** `GET /api/health?db=1` перевіряє доступність БД. Для частого
   зовнішнього моніторингу використовуйте `GET /api/health` без `db=1`: він
   перевіряє роботу застосунку без пробудження Neon.

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

### Google and Telegram sign-in

Both providers use the existing NextAuth JWT session and persist identities in `Account`.
Set the following server-only variables and restart the application:

- Google: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` from a Google OAuth web client.
  Register `https://YOUR_DOMAIN/api/auth/callback/google` as an authorized redirect URI.
- Telegram: `AUTH_TELEGRAM_ID`, `AUTH_TELEGRAM_SECRET` from BotFather → your bot → Login Widget.
  Add `https://YOUR_DOMAIN/api/auth/callback/telegram` to Allowed URLs. These are OIDC
  credentials, not the bot token or Telegram feed API credentials. Keep the default RS256 signing algorithm.
- Configure `AUTH_SECRET` (or the existing `NEXTAUTH_SECRET`) and the deployment's
  `AUTH_URL` / `NEXTAUTH_URL`. For local Google testing, register
  `http://localhost:3000/api/auth/callback/google` separately. Telegram redirects
  must also exactly match its registered URLs; use an HTTPS development domain if required.

Unconfigured providers remain disabled with an explanation; email sign-in still works.
Provider IDs are the account identity. Existing email accounts are **not** automatically
linked: users must continue with their original login method when an email already exists.
Google requires a verified email. Telegram does not return email, so its users receive
an internal `telegram-<subject>@telegram.invalid` identifier (not a contact address).
This reserved domain cannot be registered with a password. New social users have USER
permissions; blocked users cannot sign in. Provider access/refresh tokens are not stored.

References: https://authjs.dev/getting-started/providers/google and
https://core.telegram.org/bots/telegram-login.

#### Link Telegram to an existing account

Notification `telegramChatId` and OAuth `Account.providerAccountId` are distinct:
Telegram's OIDC `sub` must never be treated as the bot chat ID. A manually entered
Chat ID is not proof of account ownership.

Sign in with your existing email, open Settings, and choose Connect Telegram sign-in.
The same-origin POST creates a ten-minute encrypted HttpOnly intent. The OAuth
callback requires the same valid signed-in session, checks that the target user is
active, and creates the provider link in a serializable transaction. An identity
already owned by another account is never transferred. Each profile can link only
one Telegram identity through this flow. Existing portfolios and permissions stay
with their original user. No automatic account merging is performed.

Ordinary Telegram registration detects an existing notification Chat ID using the
verified `id` claim and asks the user to sign in to the existing profile and link it.
Internal Telegram email placeholders remain only for database compatibility and
are hidden from the profile, session, account menu and admin displays. Accounts
without a password do not show the password-change form. A notification Chat ID
cannot be newly assigned to multiple profiles; legacy manually entered IDs are
still notification destinations, not verified login identities.


#### Unified Telegram settings and auth hardening

Settings no longer accept a manually entered Chat ID. Telegram login requests
`openid profile telegram:bot_access`; the signed `id` claim is stored as
`telegramUserId` (never confuse it with OIDC `sub`). ID tokens are checked against
Telegram JWKS, issuer, audience and expiry. Keep BotFather signing at RS256
(ES256 is also supported). `TELEGRAM_BOT_TOKEN` must belong to the same bot as
`AUTH_TELEGRAM_ID` for notification setup.

Existing notification recipients and enabled state are preserved. A different
legacy recipient is only replaced by the explicit settings action. Turning
notifications off keeps both the recipient and login identity; subsequent logins
never turn notifications back on. Previously connected users should choose
Allow bot messages once. If delivery fails, open the bot, press Start and unblock
it if needed. Denied bot permissions must not prevent sign-in.

Before deploying to an existing database managed with db push, run:

```powershell
npx tsx --env-file=.env scripts/upgrade-telegram-auth.ts
npx prisma generate
```

The upgrade is additive and idempotent. It preserves users, portfolios, passwords,
roles, notification recipients and old sessions. New installations can use the
current Prisma schema. No OAuth tokens are persisted.

Public email registration always creates USER accounts, including ADMIN_EMAIL;
administrator provisioning is a trusted seed/admin operation. Emails are trimmed
and lowercased; internal placeholder addresses cannot be registered. Concurrent
email registration returns conflict without merging identities. New bcrypt
passwords are limited to 72 UTF-8 bytes; old login passwords remain compatible.
Password changes require the current password, atomically compare the original
hash and increment sessionVersion to revoke existing sessions.

PostgreSQL AuthRateLimit counters enforce 15-minute windows across serverless
instances (login: 60 attempts per IP / 10 per email+IP; registration and password
changes: 10 per IP / 5 per identity+IP). Keys are HMAC hashes and expired windows
are cleaned up. The address headers rely on Vercel's trusted proxy; another
hosting environment must supply trusted proxy headers. Limits fail closed if
the shared database is unavailable. Abandoned link intents are cleared before
ordinary Telegram sign-in; linking requires explicit intent, the same unexpired
session, an active user and transactional identity ownership checks.
