# Підсумок сесії та гайд із налаштування SonarCloud

> Документ для дипломної записки / передачі контексту. Описує, що було зроблено над якістю й тестуванням проєкту **CryptoPortfolio**, і містить покрокову інструкцію підключення SonarCloud (ще не виконано).
>
> **Дата:** 2026-06-04 · **Стек:** Next.js 14 · TypeScript 5.4 (strict) · Vitest 4.1.8 (coverage v8)

---

## Частина 1. Що зроблено за сесію

### 1.1 Відновлення стилю коду після помилкового прогону Prettier
- Виявлено, що проєкт **не відформатований Prettier** і несумісний із ним (різні файли мають різний `printWidth`), тож широкий `prettier --write` псує всю кодову базу (одинарні→подвійні лапки, перенос рядків).
- 10 раніше зачеплених файлів відновлено до стилю проєкту; точково виправлено регресію відступу в `lib/services/open-interest.ts`.
- **Висновок для записки:** скрипт `npm run format` (prettier без конфігу) наразі небезпечний — або додати `.prettierrc`, що відповідає реальному стилю, або прибрати скрипт.

### 1.2 Синхронізація документації з кодом
- `docs/PROJECT_SPEC.md` — у модель `PriceTrigger` додано `triggerType`, `targetPrice`, default для `threshold` + enum `TriggerType` (звірено зі `prisma/schema.prisma`).
- `ARCHITECTURE.md` — виправлено: «кожні 5 хвилин» → «щохвилини» (cron реально `* * * * *`); «salt-factor 10+» → «rounds = 12» (у коді `bcrypt.hash(_, 12)` скрізь).
- *Примітка:* `docs/` у `.gitignore` — правки `PROJECT_SPEC.md` лежать на диску, але git їх не відстежує.

### 1.3 Юніт-тести чистої бізнес-логіки
Покрито **детерміновані pure-функції** (без зовнішніх API / БД):

| Шар | Функції |
|---|---|
| Тригери (`lib/cron/price-updater.ts`) | `evaluateTrigger` (PERCENT), `evaluatePriceTargetTrigger` (PRICE_TARGET), `buildPriceQueries`, `resolveBalancePrice` |
| Портфельна математика (`lib/services/portfolio-math.ts`) | `computePortfolioValue`, `computeShare`, `computePnL` |
| Класифікація транзакцій (`lib/services/ankr.ts`) | `classifyTokenTransfers` (net-change) |
| Валідація (`lib/utils/validators.ts`) | `isValidEvmAddress`, `isValidSolanaAddress`, `isValidAddressForNetwork` + zod-схеми |
| Форматери (`lib/utils/format.ts`) | `formatUsd`, `formatNumber`, `formatPercent`, `formatTokenBalance`, `shortAddress`, `formatDate`, `formatRelative` |
| Мапінг ланцюгів (`lib/utils/networks.ts`) | `getChainInfo`, `getChainColor`, `getChainDisplayName`, `getChainsByNetwork` |

Граничні випадки: нульові/порожні дані, від'ємні значення, поріг рівно на межі, ділення на нуль.

### 1.4 Рефактори заради тестопридатності (режим extract, без зміни поведінки)
- **Винесено** портфельну математику в новий чистий модуль `lib/services/portfolio-math.ts`; `getPortfolioOverview`/`getPortfolioPnL` тепер викликають хелпери (тіла байт-у-байт ті самі вирази).
- **Експортовано** `classifyTokenTransfers` у `ankr.ts` (`function` → `export function`, більше нічого).
- Незмінність поведінки підтверджено: збіг виразів, збережений порядок обчислень, незмінні публічні сигнатури, `tsc` 0 / `eslint` 0 / усі тести проходять.

### 1.5 Поточні метрики якості (фактичні прогони)
| Метрика | Значення |
|---|---|
| `npx tsc --noEmit` | **0 помилок** (strict) |
| `npx next lint` | **0 помилок / 0 попереджень** |
| Типів `any` у production | **0** |
| Покриття (чистий шар) — Lines | **100%** (61/61) |
| Покриття — Statements | **100%** (76/76) |
| Покриття — Functions | **100%** (21/21) |
| Покриття — Branches | **96.42%** (54/56) |
| Тестів | **124 / 124** (6 файлів) |

### 1.6 Змінені / додані файли
**Production-код (extract, без зміни поведінки):**
- `lib/services/portfolio.ts` — inline-обчислення замінено викликами хелперів
- `lib/services/ankr.ts` — `export` для `classifyTokenTransfers`
- `lib/services/portfolio-math.ts` — **новий** чистий модуль

**Тести / конфіг / документація (не production):**
- `lib/cron/price-updater.test.ts`, `lib/services/portfolio-math.test.ts`, `lib/services/ankr-classify.test.ts`, `lib/utils/{validators,format,networks}.test.ts`
- `vitest.config.ts` — покриття v8, репортери `text/json-summary/lcov`, scope тільки по чистих модулях
- `sonar-project.properties` — конфіг SonarCloud
- `QUALITY_REPORT.md` — детальний звіт про якість (розділ 6 «SonarCloud» — з плейсхолдерами)
- `package.json` / `package-lock.json` — dev-залежності `vitest`, `@vitest/coverage-v8`

---

## Частина 2. Гайд: підключення SonarCloud (ще НЕ зроблено)

> Конфігурація вже додана (`sonar-project.properties` + lcov із Vitest). Лишилося створити проєкт на SonarCloud і запустити аналіз.

### Крок 1. Створити проєкт
1. **https://sonarcloud.io** → **Log in with GitHub** (акаунт `ruslanzhadko`).
2. **+** → **Analyze new project**.
3. Якщо вперше — створи **Organization** (прив'язану до GitHub). Її ключ = `sonar.organization`.
4. Обери репозиторій **`crypto-portfolio-app`** → **Set Up**.
5. Скопіюй **Project Key** (Project → Information).

### Крок 2. Підставити ключі в конфіг
У `sonar-project.properties` заміни плейсхолдери:
```properties
sonar.projectKey=<твій Project Key>
sonar.organization=<ключ організації>
```

### Крок 3. Запустити аналіз — обери варіант

**Варіант A — Automatic Analysis (найпростіший, без токена й CI).**
На кроці Set Up обери **Automatic Analysis** → SonarCloud аналізує репо при кожному push.
✔ дає всі метрики розділу 6 (складність, дублювання, рейтинги, hotspots, tech debt).
✖ не імпортує coverage (lcov) — для розділу 6 і не потрібно.

**Варіант B — GitHub Action (якщо потрібен і coverage в Sonar).**
1. Згенеруй токен: SonarCloud → аватар → **My Account → Security → Generate Tokens** → скопіюй.
2. GitHub → репо → **Settings → Secrets and variables → Actions → New repository secret**: ім'я `SONAR_TOKEN`, значення — токен.
3. Створи `.github/workflows/sonar.yml`:
```yaml
name: SonarCloud
on:
  push: { branches: [main, develop] }
jobs:
  sonar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx vitest run --coverage      # генерує coverage/lcov.info на Linux
      - uses: SonarSource/sonarqube-scan-action@v5
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```
4. `git push` → аналіз запуститься автоматично.

**Варіант C — локальний sonar-scanner** (потрібна Java):
```powershell
$env:SONAR_TOKEN="<твій токен>"
sonar-scanner   # читає sonar-project.properties
```

> **Порада:** для разового прогону достатньо **Варіанта A**. Для coverage всередині Sonar — **Варіант B** (також уникає проблеми Windows-шляхів у lcov, бо CI на Linux).

### Крок 4. Заповнити розділ 6 у QUALITY_REPORT.md
Після прогону відкрий дашборд і впиши **фактичні** числа в таблицю розділу 6 `QUALITY_REPORT.md`:

| Метрика | Де на дашборді |
|---|---|
| Cyclomatic Complexity (avg/max) | Measures → Complexity → *Cyclomatic Complexity* |
| Cognitive Complexity (max) | Measures → Complexity → *Cognitive Complexity* |
| Duplications % | Overview / Measures → *Duplicated Lines (%)* |
| Maintainability / Reliability / Security Rating | Overview (A–E) |
| Security Hotspots | Overview → *Security Hotspots* |
| Technical Debt | Measures → Maintainability → *Technical Debt* |

> SonarCloud показує **сумарні** Cyclomatic/Cognitive Complexity; середнє на функцію = `сума ÷ кількість функцій`, максимум — сортуванням у *Measures*.

---

## Чек-лист «що лишилось зробити вручну»
- [ ] Створити проєкт на sonarcloud.io (Крок 1)
- [ ] Підставити `projectKey` / `organization` у `sonar-project.properties` (Крок 2)
- [ ] Запустити аналіз (Варіант A / B / C)
- [ ] Вписати фактичні числа в розділ 6 `QUALITY_REPORT.md`
- [ ] (Опційно) Вирішити долю скрипта `npm run format` (див. п. 1.1)
