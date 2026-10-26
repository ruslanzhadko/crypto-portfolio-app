import type { ChangelogLocale } from "@/lib/changelog/entries";

type Text = Record<ChangelogLocale, string>;

export interface ExchangeGuide {
  /** Exchange id, also the page anchor. */
  id: string;
  name: string;
  /** Where the key is created and what to click, in order. */
  steps: Record<ChangelogLocale, string[]>;
  /** Permissions to enable (all read-only). */
  permissions: Record<ChangelogLocale, string[]>;
  /** What is not read, or a caveat worth knowing before connecting. */
  note?: Text;
}

/**
 * Connection guide per exchange. Menu names change from time to time, so steps name the section
 * rather than exact buttons. Permissions mirror the checks in lib/exchanges (read-only keys only).
 */
export const EXCHANGE_GUIDES: ExchangeGuide[] = [
  {
    id: "binance",
    name: "Binance",
    steps: {
      ru: [
        "Откройте профиль → «Управление API» (API Management) и нажмите «Создать API».",
        "Выберите «Сгенерировано системой», задайте название, например CryptoPortfolio.",
        "Включите только «Разрешить чтение». Торговлю, вывод и переводы не включайте.",
        "В «Ограничить доступ доверенными IP» добавьте IP из формы подключения на сайте.",
        "Скопируйте API Key и Secret в форму: Secret показывается один раз.",
      ],
      uk: [
        "Відкрийте профіль → «Керування API» (API Management) і натисніть «Створити API».",
        "Оберіть «Згенеровано системою», задайте назву, наприклад CryptoPortfolio.",
        "Увімкніть лише «Дозволити читання». Торгівлю, виведення й перекази не вмикайте.",
        "В «Обмежити доступ довіреними IP» додайте IP із форми підключення на сайті.",
        "Скопіюйте API Key і Secret у форму: Secret показується один раз.",
      ],
      en: [
        "Open your profile → API Management and click Create API.",
        "Choose System generated and name the key, for example CryptoPortfolio.",
        "Enable only Enable Reading. Leave trading, withdrawals and transfers off.",
        "Under Restrict access to trusted IPs, add the IP shown in the connection form on this site.",
        "Copy the API Key and Secret into the form: the Secret is shown only once.",
      ],
    },
    permissions: {
      ru: ["Только чтение", "Спот и USDⓈ-M фьючерсы читаются; для переводов — то же право чтения"],
      uk: ["Лише читання", "Спот і USDⓈ-M ф'ючерси читаються; для переказів — те саме право читання"],
      en: ["Reading only", "Spot and USDⓈ-M futures are read; transfers use the same read right"],
    },
    note: {
      ru: "COIN-M, Earn и специальные режимы не поддерживаются.",
      uk: "COIN-M, Earn і спеціальні режими не підтримуються.",
      en: "COIN-M, Earn and special modes are not supported.",
    },
  },
  {
    id: "bybit",
    name: "Bybit",
    steps: {
      ru: [
        "Откройте профиль → «API» и нажмите «Создать новый ключ».",
        "Выберите «Ключи, созданные системой», тип «API-транзакции».",
        "Права: «Только чтение». Привяжите IP из формы подключения.",
        "Скопируйте API Key и Secret в форму.",
      ],
      uk: [
        "Відкрийте профіль → «API» і натисніть «Створити новий ключ».",
        "Оберіть «Ключі, створені системою», тип «API-транзакції».",
        "Права: «Лише читання». Прив'яжіть IP із форми підключення.",
        "Скопіюйте API Key і Secret у форму.",
      ],
      en: [
        "Open your profile → API and click Create New Key.",
        "Choose System-generated API keys, type API Transaction.",
        "Permissions: Read-Only. Bind the IP shown in the connection form.",
        "Copy the API Key and Secret into the form.",
      ],
    },
    permissions: {
      ru: ["Только чтение"],
      uk: ["Лише читання"],
      en: ["Read-Only"],
    },
    note: {
      ru: "Нужен Unified Trading Account.",
      uk: "Потрібен Unified Trading Account.",
      en: "A Unified Trading Account is required.",
    },
  },
  {
    id: "gate",
    name: "Gate",
    steps: {
      ru: [
        "Откройте профиль → «Управление API» и нажмите «Создать API-ключ».",
        "Тип — API v4, вид аккаунта — торговый (классический) счёт, не Unified.",
        "Включите «Только для чтения» у Spot, Perpetual futures и Account.",
        "Для депозитов и выводов включите Wallets («Только для чтения»), для Simple Earn — Earn («Только для чтения»). По умолчанию там стоит «Чтение и запись»: переключите.",
        "Привяжите IP из формы подключения, скопируйте ключ и Secret в форму.",
      ],
      uk: [
        "Відкрийте профіль → «Керування API» і натисніть «Створити API-ключ».",
        "Тип — API v4, вид акаунта — торговий (класичний) рахунок, не Unified.",
        "Увімкніть «Лише для читання» у Spot, Perpetual futures і Account.",
        "Для депозитів і виведень увімкніть Wallets («Лише для читання»), для Simple Earn — Earn («Лише для читання»). За замовчуванням там «Читання і запис»: переключіть.",
        "Прив'яжіть IP із форми підключення, скопіюйте ключ і Secret у форму.",
      ],
      en: [
        "Open your profile → API Management and click Create API key.",
        "Type API v4, account type trading (classic) account, not Unified.",
        "Set Read-only for Spot, Perpetual futures and Account.",
        "For deposits and withdrawals enable Wallets (read-only); for Simple Earn enable Earn (read-only). They default to Read and write: switch them.",
        "Bind the IP shown in the connection form, then copy the key and Secret into the form.",
      ],
    },
    permissions: {
      ru: ["Spot, Perpetual futures, Account — только чтение", "Wallets — только чтение (депозиты и выводы)", "Earn — только чтение (Simple Earn, по желанию)"],
      uk: ["Spot, Perpetual futures, Account — лише читання", "Wallets — лише читання (депозити й виведення)", "Earn — лише читання (Simple Earn, за бажанням)"],
      en: ["Spot, Perpetual futures, Account: read-only", "Wallets: read-only (deposits and withdrawals)", "Earn: read-only (Simple Earn, optional)"],
    },
    note: {
      ru: "Ключ с правом «Чтение и запись» у любого раздела сайт не примет. Без Wallets не будет переводов, без Earn — баланса Earn. Staking и фиксированные продукты пока не читаются.",
      uk: "Ключ із правом «Читання і запис» у будь-якому розділі сайт не прийме. Без Wallets не буде переказів, без Earn — балансу Earn. Staking і фіксовані продукти поки не читаються.",
      en: "A key with Read and write on any section is rejected. Without Wallets there is no transfer history, without Earn no Earn balance. Staking and fixed-term products are not read yet.",
    },
  },
  {
    id: "okx",
    name: "OKX",
    steps: {
      ru: [
        "Откройте профиль → «API» и нажмите «Создать V5 API-ключ».",
        "Задайте название и passphrase (пароль API, не пароль аккаунта) — его нужно ввести в форму.",
        "Права: «Чтение». Привяжите IP из формы подключения.",
        "Скопируйте API Key, Secret и passphrase в форму.",
      ],
      uk: [
        "Відкрийте профіль → «API» і натисніть «Створити V5 API-ключ».",
        "Задайте назву й passphrase (пароль API, не пароль акаунта) — його потрібно ввести у форму.",
        "Права: «Читання». Прив'яжіть IP із форми підключення.",
        "Скопіюйте API Key, Secret і passphrase у форму.",
      ],
      en: [
        "Open your profile → API and click Create V5 API key.",
        "Set a name and a passphrase (an API password, not your account password): you enter it in the form.",
        "Permissions: Read. Bind the IP shown in the connection form.",
        "Copy the API Key, Secret and passphrase into the form.",
      ],
    },
    permissions: { ru: ["Чтение"], uk: ["Читання"], en: ["Read"] },
    note: {
      ru: "Только глобальный OKX (не региональный).",
      uk: "Лише глобальний OKX (не регіональний).",
      en: "Global OKX only, not regional sites.",
    },
  },
  {
    id: "bingx",
    name: "BingX",
    steps: {
      ru: [
        "Откройте профиль → «Управление API» и создайте ключ.",
        "Включите только «Чтение» (Read only). Торговлю, вывод и переводы оставьте выключенными.",
        "Привяжите IP из формы подключения.",
        "Скопируйте API Key и Secret в форму.",
      ],
      uk: [
        "Відкрийте профіль → «Керування API» і створіть ключ.",
        "Увімкніть лише «Читання» (Read only). Торгівлю, виведення й перекази залиште вимкненими.",
        "Прив'яжіть IP із форми підключення.",
        "Скопіюйте API Key і Secret у форму.",
      ],
      en: [
        "Open your profile → API Management and create a key.",
        "Enable only Read only. Leave trading, withdrawals and transfers off.",
        "Bind the IP shown in the connection form.",
        "Copy the API Key and Secret into the form.",
      ],
    },
    permissions: { ru: ["Только чтение"], uk: ["Лише читання"], en: ["Read only"] },
    note: {
      ru: "Читаются спот и бессрочные USDT-фьючерсы.",
      uk: "Читаються спот і безстрокові USDT-ф'ючерси.",
      en: "Spot and USDT perpetual futures are read.",
    },
  },
  {
    id: "bitget",
    name: "Bitget",
    steps: {
      ru: [
        "Откройте профиль → «API-ключи» и нажмите «Создать API-ключ», тип — системный.",
        "Задайте название и passphrase — он понадобится в форме.",
        "Classic: только чтение спота и фьючерсных позиций и счёта. Unified: UTA management (read) и UTA trade (read).",
        "Привяжите IP из формы подключения, скопируйте ключ, Secret и passphrase в форму.",
      ],
      uk: [
        "Відкрийте профіль → «API-ключі» і натисніть «Створити API-ключ», тип — системний.",
        "Задайте назву й passphrase — він знадобиться у формі.",
        "Classic: лише читання споту та ф'ючерсних позицій і рахунку. Unified: UTA management (read) і UTA trade (read).",
        "Прив'яжіть IP із форми підключення, скопіюйте ключ, Secret і passphrase у форму.",
      ],
      en: [
        "Open your profile → API Keys and click Create API key, system-generated.",
        "Set a name and a passphrase: you need it in the form.",
        "Classic: read-only for spot and for futures positions and account. Unified: UTA management (read) and UTA trade (read).",
        "Bind the IP shown in the connection form, then copy the key, Secret and passphrase into the form.",
      ],
    },
    permissions: {
      ru: ["Classic: чтение спота и фьючерсов", "Unified: UTA management и UTA trade — read"],
      uk: ["Classic: читання споту й ф'ючерсів", "Unified: UTA management і UTA trade — read"],
      en: ["Classic: read spot and futures", "Unified: UTA management and UTA trade, read"],
    },
    note: {
      ru: "Режим (Classic или Unified) определяется сам. Funding wallet, Earn и COIN-M не читаются.",
      uk: "Режим (Classic або Unified) визначається сам. Funding wallet, Earn і COIN-M не читаються.",
      en: "The mode (Classic or Unified) is detected automatically. Funding wallet, Earn and COIN-M are not read.",
    },
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    steps: {
      ru: [
        "Ключ не нужен: Hyperliquid публичный.",
        "Добавьте на сайте кошелёк (EVM-адрес), которым вы торгуете на Hyperliquid, затем подключите биржу к этому кошельку.",
      ],
      uk: [
        "Ключ не потрібен: Hyperliquid публічний.",
        "Додайте на сайті гаманець (EVM-адресу), яким ви торгуєте на Hyperliquid, потім підключіть біржу до цього гаманця.",
      ],
      en: [
        "No key is needed: Hyperliquid data is public.",
        "Add the wallet (EVM address) you trade with on Hyperliquid, then connect the exchange to that wallet.",
      ],
    },
    permissions: {
      ru: ["Только адрес кошелька"],
      uk: ["Лише адреса гаманця"],
      en: ["Wallet address only"],
    },
  },
  {
    id: "aster",
    name: "Aster",
    steps: {
      ru: [
        "Без ключа: добавьте EVM-кошелёк и подключите Aster. Баланс и позиции видны, если приватность аккаунта выключена в Aster.",
        "Полные данные (PnL, фандинг, депозиты и выводы): на сайте Aster создайте отдельный API Wallet в разделе API-менеджмента.",
        "Включите только чтение (canRead). Спотовую и фьючерсную торговлю и вывод выключите. Привяжите IP из формы.",
        "В форме введите адрес API Wallet и его приватный ключ. Приватный ключ основного кошелька вводить нельзя.",
      ],
      uk: [
        "Без ключа: додайте EVM-гаманець і підключіть Aster. Баланс і позиції видно, якщо приватність акаунта вимкнена в Aster.",
        "Повні дані (PnL, фандинг, депозити й виведення): на сайті Aster створіть окремий API Wallet у розділі API-менеджменту.",
        "Увімкніть лише читання (canRead). Спотову й ф'ючерсну торгівлю та виведення вимкніть. Прив'яжіть IP із форми.",
        "У формі введіть адресу API Wallet і його приватний ключ. Приватний ключ основного гаманця вводити не можна.",
      ],
      en: [
        "No key: add an EVM wallet and connect Aster. Balance and positions are visible when account privacy is off in Aster.",
        "Full data (PnL, funding, deposits and withdrawals): create a separate API Wallet in Aster's API management.",
        "Enable only reading (canRead). Turn spot trading, perpetual trading and withdrawals off. Bind the IP shown in the form.",
        "Enter the API Wallet address and its private key in the form. Never enter your main wallet's private key.",
      ],
    },
    permissions: {
      ru: ["API Wallet: только canRead"],
      uk: ["API Wallet: лише canRead"],
      en: ["API Wallet: canRead only"],
    },
    note: {
      ru: "Спот Aster пока не читается.",
      uk: "Спот Aster поки не читається.",
      en: "Aster spot is not read yet.",
    },
  },
];
