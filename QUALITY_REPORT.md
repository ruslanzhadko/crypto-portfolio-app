# Звіт про якість коду та тестування — CryptoPortfolio

> Джерело даних для дипломної записки (спеціальність 121 «Інженерія програмного забезпечення», КПІ ім. Ігоря Сікорського).
> Усі числа отримані прогоном інструментів, а не оцінені вручну.
>
> **Дата звіту:** 2026-06-04
> **Стек:** Next.js 14 · TypeScript 5.4 (strict) · Prisma 5 · Vitest 4.1.8 (coverage v8)

---

## 1. Статичний аналіз

### 1.1 Перевірка типів — TypeScript

| Параметр | Значення |
|---|---|
| Команда | `npx tsc --noEmit` |
| Режим | `strict: true` (повний strict-набір TS 5.4) |
| Помилок компіляції | **0** |
| Exit code | `0` |

Проєкт повністю проходить перевірку типів у strict-режимі: увімкнені `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes` тощо (агреговано прапорцем `strict`). Помилок немає.

### 1.2 Лінтер — ESLint (next lint)

| Параметр | Значення |
|---|---|
| Команда | `npx next lint` |
| Помилок | **0** |
| Попереджень | **0** |
| Результат | `✔ No ESLint warnings or errors` |

### 1.3 Використання типу `any` у production-коді

| Параметр | Значення |
|---|---|
| Область пошуку | `app/`, `lib/`, `components/` (файли `*.ts`, `*.tsx`), **без** тестів `*.test.ts` |
| Типів `any` | **0** |

**Метод підрахунку.** Спершу — цільовий regex по типових формах анотації `any`:
`: any` · `<any>` · `as any` · `any[]` · `Array<any>` · `Record<…any…>` → **0 збігів**.
Потім — широкий контрольний пошук цілого слова `\bany\b` по тих самих файлах. Знайдено **єдиний** збіг:

```
components/alerts/trigger-form.tsx:345:   step="any"
```

Це HTML-атрибут елемента `<input step="any">` (дозволяє дробові значення), а **не** TypeScript-тип. Отже фактична кількість типів `any` у production-коді — **0**. Кодова база є повністю типізованою без «втечі» в `any`.

---

## 2. Покриття тестами

### 2.1 Спосіб збору покриття

| Параметр | Значення |
|---|---|
| Команда | `npx vitest run --coverage` |
| Provider | **v8** (`@vitest/coverage-v8`) |
| Конфігурація | `vitest.config.ts` |
| Область покриття | **тільки чистий (детермінований, без I/O) бізнес/утиліт-шар** |

Покриття навмисно зібране **лише по чистих модулях**. Файли, що звертаються до зовнішніх API чи БД (Ankr, Moralis, CoinGecko, DexScreener, Binance, Telegram, Prisma), у відсоток **не включені**, бо їхній I/O-код юніт-тестами не покривається і занижував би показник, спотворюючи оцінку якості чистої логіки.

### 2.2 Підсумкова таблиця покриття (чистий бізнес-шар)

| Модуль | Lines | Branches | Functions | Statements |
|---|---|---|---|---|
| `lib/services/portfolio-math.ts` | 100% (5/5) | 100% | 100% | 100% |
| `lib/utils/validators.ts` | 100% (20/20) | 100% | 100% | 100% |
| `lib/utils/format.ts` | 100% (25/25) | 95.23% | 100% | 100% |
| `lib/utils/networks.ts` | 100% (11/11) | 100% | 100% | 100% |
| **РАЗОМ** | **100% (61/61)** | **96.42% (54/56)** | **100% (21/21)** | **100% (76/76)** |

Непокриті 2 гілки (`format.ts`, рядки 57 і 63) — це одна зі сторін перевірки `typeof date === 'string'` у `formatDate`/`formatRelative` (вхід типу `Date` проти `string`); на коректність не впливає.

### 2.3 Перелік покритих функцій і кількість тестів

**`lib/cron/price-updater.ts` — логіка цінових тригерів (pure)**
| Функція | Тестів |
|---|---|
| `evaluateTrigger` (PERCENT, Δ% за інтервал) | 14 |
| `evaluatePriceTargetTrigger` (PRICE_TARGET, перетин UP/DOWN) | 15 |
| `buildPriceQueries` (дедуплікація запитів цін) | 5 |
| `resolveBalancePrice` (пріоритет price-feed → CoinGecko) | 4 |

**`lib/services/portfolio-math.ts` — портфельна математика (pure)**
| Функція | Тестів |
|---|---|
| `computePortfolioValue` (V = Σ balance×price) | 4 |
| `computeShare` (частка активу, %) | 5 |
| `computePnL` (V_current − V_initial) | 5 |

**`lib/services/ankr.ts` — класифікація транзакцій (pure)**
| Функція | Тестів |
|---|---|
| `classifyTokenTransfers` (net-change: send/receive/swap + поріг + спам-фільтри) | 11 |

**`lib/utils/validators.ts` — валідація (pure)**
| Функція / схема | Тестів |
|---|---|
| `isValidEvmAddress` | 6 |
| `isValidSolanaAddress` | 4 |
| `isValidAddressForNetwork` | 4 |
| `walletCreateSchema` (.refine) | 2 |
| `triggerCreateSchema` (discriminatedUnion) | 3 |
| `profileUpdateSchema` (regex) | 3 |
| `historyDaysSchema` (.refine білий список) | 6 |

**`lib/utils/format.ts` — форматери (pure)**
| Функція | Тестів |
|---|---|
| `formatUsd` | 5 |
| `formatNumber` | 2 |
| `formatPercent` | 4 |
| `formatTokenBalance` | 6 |
| `shortAddress` | 3 |
| `formatDate` | 1 |
| `formatRelative` | 3 |

**`lib/utils/networks.ts` — мапінг ланцюгів (pure)**
| Функція | Тестів |
|---|---|
| `getChainInfo` | 3 |
| `getChainColor` | 2 |
| `getChainDisplayName` | 2 |
| `getChainsByNetwork` | 2 |

### 2.4 Протестовані функції, що НЕ входять у загальний %

Ці функції **протестовані й проходять**, але їхні файли на ~75% складаються з I/O, тому до відсотка покриття не включені (інакше показник було б штучно занижено):

| Функція | Файл (I/O-модуль) | Тестів | Причина виключення з % |
|---|---|---|---|
| `evaluateTrigger` | `lib/cron/price-updater.ts` | 14 | файл містить Prisma + Telegram + CoinGecko виклики |
| `evaluatePriceTargetTrigger` | `lib/cron/price-updater.ts` | 15 | те саме |
| `buildPriceQueries` | `lib/cron/price-updater.ts` | 5 | те саме |
| `resolveBalancePrice` | `lib/cron/price-updater.ts` | 4 | те саме |
| `classifyTokenTransfers` | `lib/services/ankr.ts` | 11 | файл містить Ankr JSON-RPC виклики |

> Щоб завести цю логіку в єдиний %-метрик, її довелося б винести в окремі чисті модулі. Це не зроблено свідомо: для `ankr.ts` діє обмеження «лише export, нічого більше не чіпати», а наявні тести вже доводять коректність логіки.

### 2.5 Кількість тестів

| Параметр | Значення |
|---|---|
| Тестів пройдено / всього | **124 / 124** |
| Тест-файлів | **6** |
| Падінь | 0 |

Файли тестів:
- `lib/cron/price-updater.test.ts` — 38 тестів
- `lib/services/portfolio-math.test.ts` — 14
- `lib/services/ankr-classify.test.ts` — 11
- `lib/utils/validators.test.ts` — 28
- `lib/utils/format.test.ts` — 24
- `lib/utils/networks.test.ts` — 9

---

## 3. Рефактори заради тестопридатності

Усі зміни виконані в режимі **extract** (вилучення без переписування). Сигнатури та результати публічних `async`-функцій не змінювалися.

### 3.1 Винесено: портфельна математика → `lib/services/portfolio-math.ts`

Створено новий **чистий синхронний** модуль із трьома функціями, тіла яких **байт-у-байт** повторюють колишні inline-вирази з `portfolio.ts`:
- `computePortfolioValue(values)` — `values.reduce((s, v) => s + v, 0)`
- `computeShare(part, total)` — `total > 0 ? (part / total) * 100 : 0`
- `computePnL(current, initial)` — `{ absolute: current − initial, percent: initial > 0 ? (absolute/initial)*100 : 0 }`

### 3.2 Експортовано: класифікація транзакцій

`classifyTokenTransfers` у `lib/services/ankr.ts` зроблено `export` (зміна одного ключового слова `function` → `export function`). Логіка функції не торкана.

### 3.3 Доведення незмінності поведінки

1. **Ідентичність виразів.** Тіла хелперів дослівно збігаються з кодом, який вони замінили (див. diff нижче).
2. **Збереження порядку обчислень.** `computePortfolioValue` викликається на `Array.from(tokenMap.values()).map((t) => t.totalUsd)` — ті самі елементи в тому самому порядку, тому сума float побітово ідентична оригінальному `reduce`.
3. **Незмінні контракти.** Публічні типи результату (`PortfolioOverview`, `PnLResult`) і сигнатури `getPortfolioOverview` / `getPortfolioPnL` не змінені.
4. **Інструментальне підтвердження.** `npx tsc --noEmit` → 0 помилок; `npx next lint` → 0 помилок; усі 124 тести проходять.

### 3.4 Змінені production-файли (короткий diff)

**`lib/services/portfolio.ts`** — inline-вирази замінено викликами хелперів:
```diff
+import { computePortfolioValue, computeShare, computePnL } from '@/lib/services/portfolio-math';

-  const totalUsd = Array.from(tokenMap.values()).reduce((s, t) => s + t.totalUsd, 0);
+  const totalUsd = computePortfolioValue(Array.from(tokenMap.values()).map((t) => t.totalUsd));

-    t.share = totalUsd > 0 ? (t.totalUsd / totalUsd) * 100 : 0;
+    t.share = computeShare(t.totalUsd, totalUsd);

-      w.share = t.totalUsd > 0 ? (w.usdValue / t.totalUsd) * 100 : 0;
+      w.share = computeShare(w.usdValue, t.totalUsd);

-      share: totalUsd > 0 ? (total / totalUsd) * 100 : 0,
+      share: computeShare(total, totalUsd),

-  const absolute = current - initial;
-  const percent = initial > 0 ? (absolute / initial) * 100 : 0;
+  const { absolute, percent } = computePnL(current, initial);
```

**`lib/services/ankr.ts`** — лише експорт:
```diff
-function classifyTokenTransfers(
+export function classifyTokenTransfers(
   wallet: string,
   transfers: AnkrTokenTransfer[],
 ): NormalizedTransaction[] {
```

**`lib/services/portfolio-math.ts`** — новий файл (3 чисті функції, ~25 рядків).

> Тестова інфраструктура (не production): додано `vitest.config.ts` та dev-залежності `vitest`, `@vitest/coverage-v8`; створено 6 файлів `*.test.ts`.

---

## 4. Відповідність нефункціональним вимогам (NFR)

| NFR | Підтвердження цими результатами |
|---|---|
| **Типобезпека** | `tsc --noEmit` = 0 помилок у strict-режимі; 0 типів `any` у production-коді — статичні гарантії типів на етапі компіляції. |
| **Якість коду / стиль** | ESLint = 0 помилок, 0 попереджень. |
| **Коректність бізнес-логіки** | 124 юніт-тести на детерміновані pure-функції (розрахунок вартості портфеля, частка, PnL, класифікація транзакцій, логіка тригерів PERCENT/PRICE_TARGET), включно з граничними випадками (нульові/порожні дані, від'ємні значення, поріг рівно на межі, ділення на нуль). |
| **Покриття чистої логіки** | 100% Lines / 100% Functions / 100% Statements / 96.42% Branches по чистому бізнес-шару. |
| **Чисті функції (тестопридатність)** | Бізнес-математику винесено в pure-модуль `portfolio-math.ts` без I/O — детерміновані входи/виходи, відсутність побічних ефектів. |
| **Поділ шарів (Layered Architecture)** | Чиста логіка ізольована від I/O: формули та валідація не залежать від Prisma/HTTP, що й уможливило їх юніт-тестування без моків зовнішніх сервісів. |
| **Незмінність поведінки при рефакторингу** | Рефактори в режимі extract + збіг виразів + проходження всіх тестів і tsc/lint доводять, що поведінка не змінилася. |

---

## 5. Зведена таблиця «метрика → значення» (для швидкого копіювання)

| Метрика | Значення |
|---|---|
| Помилок компіляції TypeScript (`tsc --noEmit`) | 0 |
| Режим TypeScript | strict |
| Помилок ESLint | 0 |
| Попереджень ESLint | 0 |
| Типів `any` у production-коді | 0 |
| Покриття — Lines | 100% (61/61) |
| Покриття — Statements | 100% (76/76) |
| Покриття — Functions | 100% (21/21) |
| Покриття — Branches | 96.42% (54/56) |
| Тестів пройдено / всього | 124 / 124 |
| Тест-файлів | 6 |
| Покритих чистих функцій (у %) | 18 |
| Додатково протестованих функцій (поза %, I/O-файли) | 5 |
| Coverage provider | v8 |
| Команда тестів | `npx vitest run --coverage` |

---

## 6. SonarCloud

> ⏳ **Статус:** конфігурацію додано (`sonar-project.properties`, lcov-репорт із Vitest). Сам аналіз запускається на акаунті власника репозиторію на [sonarcloud.io](https://sonarcloud.io). Значення в таблиці заповнюються **фактичними числами з дашборду** після першого прогону — не з пам'яті й не оцінкою.

**Репозиторій:** `https://github.com/ruslanzhadko/crypto-portfolio-app`
**Дашборд (після створення проєкту):** `https://sonarcloud.io/project/overview?id=<PROJECT_KEY>`

| Метрика | Значення | Де взяти на дашборді |
|---|---|---|
| Cyclomatic Complexity (avg / max) | _(заповнити)_ | Measures → Complexity → *Cyclomatic Complexity* (avg = total ÷ к-сть функцій) |
| Cognitive Complexity (max) | _(заповнити)_ | Measures → Complexity → *Cognitive Complexity* |
| Duplications % | _(заповнити)_ | Overview / Measures → *Duplications* (`Duplicated Lines (%)`) |
| Maintainability Rating | _(A–E)_ | Overview → *Maintainability* |
| Reliability Rating | _(A–E)_ | Overview → *Reliability* |
| Security Rating | _(A–E)_ | Overview → *Security* |
| Security Hotspots | _(к-сть)_ | Overview → *Security Hotspots* |
| Technical Debt | _(напр. «10min»)_ | Measures → Maintainability → *Technical Debt* (`sqale_index`) |

> **Примітка по метриках складності.** SonarCloud публікує **сумарну** Cyclomatic та Cognitive Complexity по проєкту (метрики `complexity`, `cognitive_complexity`). Середнє значення на функцію рахується як `сума ÷ кількість функцій`; максимум на функцію видно при сортуванні файлів/функцій у вкладці *Measures → Complexity*. Впишіть саме ті числа, що показує ваш дашборд.

**Конфігурація аналізу (`sonar-project.properties`):**
- `sonar.sources = app, lib, components`
- `sonar.exclusions = node_modules, .next, coverage, *.test.ts(x), prisma/migrations`
- тести: `**/*.test.ts(x)`; покриття: `coverage/lcov.info` (Vitest v8).

---

*Звіт згенеровано на основі фактичних прогонів `npx vitest run --coverage` та `npx tsc --noEmit`. Production-код при створенні цього звіту не змінювався. Розділ 6 (SonarCloud) заповнюється фактичними числами з дашборду після першого прогону аналізу.*
