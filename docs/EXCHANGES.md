# Биржевые балансы и позиции

Реализованы серверные подключения Binance, Bybit, Gate, OKX, BingX, Bitget, Aster и
Hyperliquid, worker, сводный капитал, дашборд и история снимков. Функция выключена по
умолчанию; с 20.10.2026 включена в production для пилота (владелец). Подробная передача контекста —
[EXCHANGES_HANDOFF.md](EXCHANGES_HANDOFF.md); нагрузка на БД и бюджет —
[INFRASTRUCTURE.md](INFRASTRUCTURE.md).
Это мониторинг: приложение не размещает ордера, не переводит и не выводит средства.

## Поддержка

| Источник    | Балансы                                        | Позиции                           | Ограничения                                                                                                              |
| ----------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Binance     | Spot, классический USDⓈ-M                      | USDT/USDC, hedge и one-way        | Только read-only с IP restriction; если futures endpoint недоступен, сохраняется spot и показывается частичный результат |
| Bybit       | Unified UTA, cross/isolated, все монеты        | Linear USDT/USDC, hedge и one-way | Classic и portfolio margin не поддержаны; открытые inverse/options блокируют синхронизацию общего счёта                  |
| Gate        | Classic Spot и отдельный USDT futures wallet | USDT perpetuals, one-way/hedge | Read-only ключ основного аккаунта с IP whitelist; Unified, portfolio margin и split positions не поддержаны |
| OKX global  | Единый trading account, включая spot | Linear USDT/USDC SWAP, net/long/short | Read-only + IP whitelist + API Passphrase; режимы 1/2/3, без portfolio margin, открытых inverse/options/delivery/spot-margin позиций |
| Hyperliquid | HyperCore spot и classic perp equity / unified | Основной perp DEX                 | По существующему EVM-адресу; portfolio margin и HIP-3 не поддержаны                                                      |
| BingX       | Spot и USDT perpetual                          | USDT perpetuals                   | Funding/PnL/комиссии текущего цикла из истории; неполная история → «—»                                                   |
| Bitget      | Classic v2 (spot + USDT/USDC futures) или Unified v3, режим определяется автоматически | Linear USDT/USDC | Funding wallet, Earn, COIN-M не поддержаны; см. [docs/bitget.md](bitget.md) |
| KuCoin      | Classic: spot (main + trade) и USDT/USDC futures (`api-futures.kucoin.com`) | Linear USDT/USDC, лоты × `multiplier`, XBT → BTC | Ключ только `General` + Passphrase; IP whitelist API не сообщает (не проверяется); точный итог закрытия — `history-positions.pnl`; Unified, margin, Earn, inverse не поддержаны; не проверено на живом ключе |
| Lighter     | Основной счёт и субаккаунты по EVM-адресу (публично, без ключа); залог не в USDC добавляется к `total_asset_value` | Бессрочные, cross/isolated, плечо = 100 / IMF | Подключается само при синхронизации кошелька; фандинг позиций не показывается (знак `total_funding_paid_out` не документирован); итог закрытия — оценка |
| Aster       | Фьючерсный счёт (по адресу кошелька или через API Wallet) | USDT perpetuals, Shield Mode (по адресу) | Spot не поддержан; полные funding/комиссии/безубыточность только через API Wallet; приватный аккаунт подключается с подсказкой; см. [docs/ASTER.md](ASTER.md) |

Funding-счета, Earn, займы как отдельные продукты, история сделок и инвестиционная
доходность не входят в релиз. Долги в поддерживаемом счёте сохраняются и учитываются
его собственным net equity. Доступные поля берутся из API; отсутствующие — `null`.

CCXT закреплён на `4.5.85` и используется как серверный транспорт подписи и REST.
Адаптеры обращаются к native read endpoints, чтобы сохранять исходные decimal-строки
и контролировать пагинацию/режимы, а не зависеть от неодинаковой унификации CCXT.
Экземпляры клиентов переиспользуются; CCXT не импортируется в клиентский интерфейс.

### Подключение Gate и OKX

- Gate: отдельный read-only ключ основного аккаунта с разрешениями Spot, Futures,
  Account и Unified (последнее нужно только для чтения текущего режима). Добавить
  исходящий IP worker. Через `account/main_keys` проверяются права именно текущего
  ключа; неоднозначные маски и отсутствие доступа к проверке прав отклоняются.
- OKX: глобальный аккаунт `okx.com`, ключ с разрешением Read, IP worker и API
  Passphrase. Passphrase хранится в том же AES-GCM envelope, что key/secret,
  никогда не возвращается в API и повторно вводится при замене ключа.
- Для Gate капитал futures равен `total + unrealised_pnl`, отдельно от spot.
  Для OKX капитал берётся из `totalEq` один раз, без прибавления монет или PnL.
  Количество контрактов пересчитывается в монеты через `quanto_multiplier` / `ctVal`.
- Накопленные funding, закрытый PnL и комиссии приходят с текущей позицией:
  Gate `pnl_fund/pnl_pnl/pnl_fee`, OKX `fundingFee/pnl/fee`. Отдельные запросы истории
  не нужны. Комиссионный cash flow превращается в расходы со знаком минус при
  расчёте итогового PnL; rebates сохраняются. Отсутствующие значения не заменяются
  нулями. POINT-комиссии Gate и дополнительные liquidation/settlement-компоненты
  OKX не дают вычислять неподтверждённый итог или цену безубыточности.
- Публичные параметры контрактов и следующий funding кэшируются. Публичные GET
  проверены без ключей; приватное подключение конкретного аккаунта требует пилотной
  сверки после добавления ключа. Нужны обновлённые web и worker; миграция БД не нужна.

Источники схем: [Gate account](https://www.gate.com/docs/developers/apiv4/en/account/),
[Gate futures](https://www.gate.com/docs/developers/apiv4/en/futures/),
[OKX API v5](https://app.okx.com/docs-v5/en/).

## Перед запуском с реальными ключами

1. Проверить актуальный онлайн-аудит зависимостей: `npm audit --omit=dev --offline=false`.
   На 07.10.2026 Next.js обновлён до 15.5.27, production-аудит чистый.
   Полный аудит пока содержит 8 связанных high-замечаний к build/dev-цепочке
   `braces`; условия применимости и ограничения описаны в `SECURITY_AUDIT.md`.
   После обновления кода пересобрать и web deployment, и образ worker.
2. Выбрать Linux VPS с фиксированным **исходящим** IP, доступным для API обеих бирж
   в выбранном регионе. Проверить синхронизацию часов (NTP), HTTPS и доступ к Neon.
3. Сделать резервную копию БД и проверить восстановление. SQL ниже только добавляет
   таблицы; он не удаляет историю и не изменяет старые Float-столбцы.
4. Выполнить пилотную сверку с реальными read-only аккаунтами. Fixtures и браузерные
   тесты не доказывают доступность конкретного региона, разрешений и типа аккаунта.

## База данных

Для существующих установок, управляемых через `db push`:

```powershell
npm run db:generate
npm run exchanges:upgrade
```

`exchanges:upgrade` выполняет `prisma/exchanges.sql` внутри одной транзакции,
отказывается повторно создавать уже существующие таблицы и не выполняет reset.
Использует `DATABASE_URL` из окружения/.env: перед запуском проверьте целевую БД.
Для совершенно новой локальной БД можно использовать обычный `npm run db:push`.
Не запускайте upgrade после db:push: в этом случае таблицы уже созданы.

## Серверные настройки

Одинаковые настройки задаются web-приложению и worker:

```dotenv
EXCHANGES_ENABLED=true
EXCHANGES_PILOT_USER_IDS=<User.id пилотного пользователя>
EXCHANGE_ENCRYPTION_KEY_VERSION=1
EXCHANGE_ENCRYPTION_KEYS={"1":"<случайные 32 байта в base64>"}
EXCHANGE_FINGERPRINT_KEY=<отдельный случайный секрет минимум 32 символа>
EXCHANGE_WORKER_PUBLIC_IP=<фиксированный исходящий IP worker>
```

В рабочем `.env` JSON следует заключать в одинарные кавычки. Генерируйте случайные
ключи локально через менеджер секретов или Node `crypto.randomBytes(32)`. Не
используйте примеры/тестовые ключи из тестов. Эти переменные не имеют `NEXT_PUBLIC_`
и не должны попадать в Git. Ключ шифрования нельзя хранить в самой БД.

Режимы worker «активный / простой» (без них worker будит Neon круглосуточно):

```dotenv
# Vercel (Production/Preview) и worker — одинаковое значение, минимум 32 символа
EXCHANGE_WORKER_SIGNAL_SECRET=<случайная строка>
# Только worker: адрес приложения, которое он опрашивает (каждые 10 с, без БД)
EXCHANGE_ACTIVITY_URL=https://<домен приложения>/api/worker/activity
# Только worker и только для защищённого Preview: Protection Bypass for Automation
EXCHANGE_ACTIVITY_BYPASS=<секрет обхода защиты Vercel>
```

Пока пользователь открыт на страницах бирж, позиций, дашборда или кошельков (и 10 минут
после последнего запроса), его подключения обновляются как раньше — каждые ~30 с.
Без зрителей все подключения синхронизируются одним окном в начале каждого получаса
(`:00`/`:30`), после чего worker закрывает соединения с БД. Сигнал «пользователь смотрит»
хранится в Vercel Runtime Cache, а не в PostgreSQL. Если `EXCHANGE_ACTIVITY_URL` или
секрет не заданы, worker работает по-старому (быстро для всех). Docker healthcheck читает
локальный файл, а не БД. Подробнее — [INFRASTRUCTURE.md](INFRASTRUCTURE.md) §3.1.

Worker также нужны `DATABASE_URL`, `DIRECT_URL` и опционально `COINGECKO_API_KEY`.
Курс USDT/USDC берётся по фиксированным CoinGecko ID; при недоступной оценке деньги
не пересчитываются по выдуманному курсу 1:1. Неполнота явно показывается.

```powershell
# Локальный запуск после настройки .env
npm run exchanges:worker

# Образ worker, без .env и локальных артефактов
docker build -f Dockerfile.exchanges -t cryptoportfolio-exchanges .
docker run -d --name cryptoportfolio-exchanges --restart unless-stopped --env-file /secure/exchanges.env cryptoportfolio-exchanges
```

На VPS секретный env-файл доступен только владельцу. Не публикуйте порт worker —
он сам читает очередь из БД. Не запускайте worker как Vercel Function. Проверка
ключей и любые private API запросы должны исходить с того IP, который указан в UI.
Для нового пользователя с социальной авторизацией повторный вход требуется,
если замена ключа выполняется спустя более 10 минут после входа. Парольные аккаунты
могут подтвердить свой пароль в форме замены. Ключи с торговыми/transfer/withdraw
правами отклоняются; приложение не предлагает включать торговлю для чтения futures.

## Поведение и целостность

- Один слот очереди на подключение. Lease/token и версия credentials защищают от
  параллельных и поздних результатов. Полный ответ раздела атомарно заменяет его
  данные. Неполный ответ не обнуляет баланс и не закрывает позиции.
- Целевые интервалы: 30 секунд для позиций и связанного equity; 2 минуты для
  Binance spot. Unified и HyperCore обновляются целиком раз в 30 секунд.
  При большой очереди/ограничениях API это целевые интервалы, а не SLA.
- Бюджет запросов общий через PostgreSQL; нужен один общий DB для worker с общим
  исходящим IP. Экземпляры worker могут масштабироваться, задания используют
  `FOR UPDATE SKIP LOCKED`. На пилоте лимит — 10 CEX-подключений на пользователя.
- Терминальные ошибки ключа прекращают автоматические запросы до замены ключа.
  Временные сбои используют backoff/jitter. Журнал содержит только безопасные коды.
- Пауза сохраняет последние значения с отметкой устаревания. Отключение удаляет
  credentials, отменяет задания и исключает источник из текущего капитала.
  Отозвать сам ключ на бирже нужно отдельно.
- HyperCore обнаруживается по сохранённым балансам EVM-кошельков. После первой
  полной синхронизации legacy-строки остаются в БД, но исключаются из общего
  капитала. HyperEVM продолжает обслуживать существующий wallet sync.
- Общий капитал использует net equity независимых счетов. Монеты, notional,
  заблокированное обеспечение и PnL не прибавляются к нему повторно.
- Снимки общего капитала сохраняются по пятиминутным корзинам. Общая история
  начинается с подключения; старые снимки доступны на `/dashboard/history`.
  Состав источников и полнота сохраняются в каждом снимке. Изменения состава
  не вычисляются как PnL; изменение стоимости не является инвестиционной доходностью.
- Все операции с новыми данными ограничены владельцем; ADMIN не получает доступа
  к чужим credentials. Ответы новых API имеют `Cache-Control: private, no-store`.

## Ротация и эксплуатация

### Развёртывание worker (с 20.10.2026)

Production-worker `cryptoportfolio-worker-production` и listener `cryptoportfolio-listener-production`
разворачиваются GitHub Actions из `main` на GCP VM ([GITHUB_ACTIONS.md](GITHUB_ACTIONS.md));
конфигурация — `/etc/cryptoportfolio-worker-deploy.conf`, секреты — `exchange-production.env` и
`telegram-feed.env` (MIGRATIONS.md §2, §5). Push в `develop` только прогоняет проверки. Сборка идёт из
чистого архива конкретного коммита до остановки работающего контейнера; после замены проверяется
heartbeat (локальный файл) нового worker, при неудаче возвращается прежний контейнер. Миграции БД не
запускаются. Коммит, проваливший сборку или проверку, записывается в `<state>/failed`: новая версия
попробуется автоматически, повтор той же — после удаления этого файла. После аварийного выключения во
время замены остаётся `<name>-previous` — его нужно восстановить вручную. Сам скрипт деплоя
устанавливается на VM вручную и не обновляет себя (MIGRATIONS.md §5). Перед ростом пилота — сверка
equity с биржей, pause/resume, отзыв ключа, повтор запуска VM, устаревание данных и сохранность ключа
шифрования.

Для ротации шифрования добавьте новую версию в keyring обоих процессов, затем
переключите активную версию. Worker перешифрует ключи при следующем создании
клиента (после рестарта либо удаления неактивного клиента из кеша). Старую версию
сохраняйте, пока все записи, включая paused/invalid, не перешифрованы или удалены;
ключи в резервных копиях также нуждаются в прежней версии. Fingerprint-секрет
остаётся стабильным и не совпадает с ключом шифрования.

Контролируйте:

- `ExchangeWorkerLease` с именами `worker:*`: heartbeat каждые 20 секунд;
  UI считает worker недоступным после 90 секунд.
- Задержку `ExchangeSyncJob.dueAt`, последние успешные времена отдельных разделов,
  частоту safe error codes и рост нагрузки Neon. История запусков хранится 7 дней.
- Расход Neon: в простое worker обращается к БД раз в 30 минут — [INFRASTRUCTURE.md](INFRASTRUCTURE.md) §3.1.
- Сверку equity с биржей, учёт всех страниц, отключение ключа, восстановление
  процесса и работу при временном отсутствии цен.

План отката: сначала остановить worker и оставить UI в режиме отображения
последних данных. После миграции HyperCore нельзя просто вернуть старый код и
считать сохранённые legacy-балансы свежими. Для полного отката необходимо
согласованно вернуть HyperCore владельцу wallet-sync и синхронизировать его,
сохранив новые таблицы и историю. Удалять таблицы для отката не требуется.

## Проверки

```powershell
npm test
npm run typecheck
npm run lint
npm run build

# Только отдельная тестовая БД с новой схемой, никогда production
$env:EXCHANGE_TEST_DATABASE_URL='postgresql://<test-user>:<test-password>@127.0.0.1:<port>/exchange_test'
$env:DATABASE_URL=$env:EXCHANGE_TEST_DATABASE_URL
npm test -- lib/exchanges/integration.test.ts
npx playwright test --config playwright.exchanges.config.ts
```

Интеграционные и E2E-тесты намеренно принимают только localhost-БД `exchange_test`.
Браузерные тесты используют настоящие API/авторизацию/Prisma и синтетический ответ
worker; они не отправляют тестовые ключи на биржи. Реальный worker и реальные
биржевые ключи во время этих проверок не нужны.

Официальные источники: [CCXT](https://github.com/ccxt/ccxt/wiki/Manual),
[Bybit balances](https://bybit-exchange.github.io/docs/v5/account/wallet-balance),
[Bybit positions](https://bybit-exchange.github.io/docs/v5/position),
[Binance permissions](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account),
[Hyperliquid Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint).
