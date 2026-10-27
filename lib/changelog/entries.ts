export type ChangelogLocale = "ru" | "uk" | "en";

export interface ChangelogEntry {
  /** ISO date of the release. Newest entry first. */
  date: string;
  title: Record<ChangelogLocale, string>;
  items: Record<ChangelogLocale, string[]>;
}

/**
 * Product changelog: only noticeable features and important fixes, a few short lines each.
 * Not for styling tweaks, refactors, infrastructure or small bug fixes (see CLAUDE.md).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-27",
    title: {
      ru: "Единый вид обзора для кошельков и бирж",
      uk: "Єдиний вигляд огляду для гаманців і бірж",
      en: "One overview layout for wallets and exchanges",
    },
    items: {
      ru: [
        "Вкладки «Всё», «Кошельки» и «Биржи» в обзоре устроены одинаково: транзакции слева, графики распределения и источники капитала справа.",
        "Лидеры роста и падения и распределение активов теперь есть и для бирж. На вкладке «Биржи» график показывает распределение по биржам, на «Всё» — по сетям и биржам вместе.",
        "«Настроить обзор» включает и выключает эти блоки на всех трёх вкладках.",
      ],
      uk: [
        "Вкладки «Усе», «Гаманці» та «Біржі» в огляді влаштовані однаково: транзакції ліворуч, графіки розподілу та джерела капіталу праворуч.",
        "Лідери зростання й падіння та розподіл активів тепер є й для бірж. На вкладці «Біржі» графік показує розподіл по біржах, на «Усе» — по мережах і біржах разом.",
        "«Налаштувати огляд» вмикає й вимикає ці блоки на всіх трьох вкладках.",
      ],
      en: [
        "The All, Wallets and Exchanges tabs of the overview share one layout: transactions on the left, allocation charts and capital sources on the right.",
        "Top gainers and losers and asset allocation now cover exchanges too. The Exchanges tab shows allocation by exchange; All shows networks and exchanges together.",
        "Customize overview turns these blocks on and off on all three tabs.",
      ],
    },
  },
  {
    date: "2026-10-26",
    title: {
      ru: "Гайд по подключению бирж и Gate Earn",
      uk: "Гайд із підключення бірж і Gate Earn",
      en: "Exchange connection guide and Gate Earn",
    },
    items: {
      ru: [
        "Новая страница «Как подключить»: где создать API-ключ на каждой бирже и какие права включить. Ссылка есть в форме подключения, в меню «Ещё» и на главной.",
        "Gate: баланс Simple Earn входит в капитал и подписан «Earn» (нужно право Earn «только чтение» в ключе).",
        "В позиции рядом со ставкой следующего funding показана ожидаемая сумма в долларах: получите вы или заплатите.",
        "Суммы и проценты на странице позиций меняются плавно, а не скачком.",
      ],
      uk: [
        "Нова сторінка «Як підключити»: де створити API-ключ на кожній біржі та які права ввімкнути. Посилання є у формі підключення, в меню «Ще» і на головній.",
        "Gate: баланс Simple Earn входить у капітал і підписаний «Earn» (потрібне право Earn «лише читання» в ключі).",
        "У позиції поруч зі ставкою наступного funding показана очікувана сума в доларах: отримаєте ви чи заплатите.",
        "Суми й відсотки на сторінці позицій змінюються плавно, а не стрибком.",
      ],
      en: [
        "New \"How to connect\" page: where to create an API key on each exchange and which permissions to enable. Linked from the connection form, the More menu and the home page.",
        "Gate: the Simple Earn balance counts in your capital and is labelled Earn (the key needs the Earn read-only permission).",
        "A position shows the expected next funding payment in dollars beside the rate: whether you receive or pay.",
        "Amounts and percentages on the positions page change smoothly instead of jumping.",
      ],
    },
  },
  {
    date: "2026-10-25",
    title: {
      ru: "Депозиты и выводы бирж в последних транзакциях",
      uk: "Депозити та виведення бірж в останніх транзакціях",
      en: "Exchange deposits and withdrawals in recent transactions",
    },
    items: {
      ru: [
        "На вкладке «Всё» обзора — один список транзакций кошельков и переводов бирж, по времени.",
        "Переключатель «Всё / Кошельки / Биржи», фильтры по счёту, сети и типу; ожидающие и неудачные переводы помечены.",
        "Переводы между своими кошельками и биржами показываются одной строкой «откуда → куда».",
        "Покупки и продажи токенов за ETH через DEX-агрегаторы теперь свапы, а не отдельные получения и отправки; сделки Hyperliquid — сделки с PnL.",
      ],
      uk: [
        "На вкладці «Усе» огляду — один список транзакцій гаманців і переказів бірж, за часом.",
        "Перемикач «Усе / Гаманці / Біржі», фільтри за рахунком, мережею і типом; очікувані й невдалі перекази позначено.",
        "Перекази між своїми гаманцями та біржами показуються одним рядком «звідки → куди».",
        "Купівлі й продажі токенів за ETH через DEX-агрегатори тепер свопи, а не окремі отримання й відправлення; угоди Hyperliquid — угоди з PnL.",
      ],
      en: [
        "The overview's All tab shows wallet transactions and exchange transfers in one list, newest first.",
        "An All / Wallets / Exchanges switch and filters by account, network and type; pending and failed transfers are marked.",
        "Transfers between your own wallets and exchanges show as one \"from → to\" row.",
        "Tokens bought or sold for ETH through DEX aggregators show as swaps, not separate receives and sends; Hyperliquid fills show as trades with PnL.",
      ],
    },
  },
  {
    date: "2026-10-24",
    title: {
      ru: "Монеты на биржах открываются на бирже",
      uk: "Монети на біржах відкриваються на біржі",
      en: "Exchange coins open on their exchange",
    },
    items: {
      ru: ["Нажатие на монету, которая лежит на бирже, открывает её торговую страницу на этой бирже, для фьючерсного счёта — фьючерсы; строки кошельков ведут на страницу токена."],
      uk: ["Натискання на монету, яка лежить на біржі, відкриває її торгову сторінку на цій біржі, для ф'ючерсного рахунку — ф'ючерси; рядки гаманців ведуть на сторінку токена."],
      en: ["Tapping a coin held on an exchange opens its market there (futures for a futures account); wallet lines open the token page."],
    },
  },
  {
    date: "2026-10-24",
    title: {
      ru: "Перевод с кошелька на биржу больше не завышает капитал",
      uk: "Переказ із гаманця на біржу більше не завищує капітал",
      en: "Moving funds from a wallet to an exchange no longer inflates capital",
    },
    items: {
      ru: ["Когда на биржу приходит депозит, кошельки синхронизируются сразу, и деньги не считаются дважды несколько часов."],
      uk: ["Коли на біржу надходить депозит, гаманці синхронізуються одразу, і гроші не рахуються двічі кілька годин."],
      en: ["When a deposit reaches an exchange, your wallets sync right away, so the money is not counted twice for hours."],
    },
  },
  {
    date: "2026-10-23",
    title: {
      ru: "Капитал в шапке на любой странице",
      uk: "Капітал у шапці на будь-якій сторінці",
      en: "Capital in the header on every page",
    },
    items: {
      ru: ["Справа вверху — общий капитал, его изменение за 24 ч и PnL открытых позиций; нажатие открывает обзор."],
      uk: ["Праворуч угорі — загальний капітал, його зміна за 24 год і PnL відкритих позицій; натискання відкриває огляд."],
      en: ["Top right shows your total capital, its 24h change and the PnL of open positions; tap it to open the overview."],
    },
  },
  {
    date: "2026-10-23",
    title: {
      ru: "Новые уведомления видно на сайте",
      uk: "Нові сповіщення видно на сайті",
      en: "New alerts are visible on the site",
    },
    items: {
      ru: [
        "Красная точка у «Алертов» в меню (на телефоне — у «Ещё»), пока сработавшее уведомление не просмотрено.",
        "Журнал уведомлений крупнее, сгруппирован по дням, новые отмечены; триггеры — компактными карточками.",
      ],
      uk: [
        "Червона крапка біля «Алертів» у меню (на телефоні — біля «Ще»), доки спрацьоване сповіщення не переглянуто.",
        "Журнал сповіщень більший, згрупований за днями, нові позначено; тригери — компактними картками.",
      ],
      en: [
        "A red dot next to Alerts in the menu (More on phones) until a fired alert has been seen.",
        "The notification log is larger, grouped by day with new alerts marked; triggers are compact cards.",
      ],
    },
  },
  {
    date: "2026-10-23",
    title: {
      ru: "Честный результат в лидерах роста и падения",
      uk: "Чесний результат у лідерах зростання та падіння",
      en: "Honest results in top gainers and losers",
    },
    items: {
      ru: [
        "Доллары за 24 ч учитывают покупки и продажи внутри суток, а не только текущий размер позиции.",
        "Процент — ваша доходность по позиции: для монеты, купленной сегодня, он считается от покупки, рядом видно, за сколько часов.",
      ],
      uk: [
        "Долари за 24 год враховують купівлі та продажі всередині доби, а не лише поточний розмір позиції.",
        "Відсоток — ваша дохідність за позицією: для монети, купленої сьогодні, він рахується від купівлі, поруч видно, за скільки годин.",
      ],
      en: [
        "The 24h dollar change now accounts for buys and sells during the day, not just the current position size.",
        "The percentage is your own return on the position: for a coin bought today it counts from the purchase, with the hours shown next to it.",
      ],
    },
  },
  {
    date: "2026-10-23",
    title: {
      ru: "Мобильное меню и точные цены",
      uk: "Мобільне меню та точні ціни",
      en: "Mobile menu and accurate prices",
    },
    items: {
      ru: [
        "Новое меню «Ещё» на телефоне: закруглённая панель с анимацией. Внизу снова «Кошельки».",
        "Детали позиции плавно раскрываются и сворачиваются.",
        "Исправлены скачки капитала кошельков: цены токенов сверяются с CoinGecko, ошибочные точки в истории исправлены.",
      ],
      uk: [
        "Нове меню «Ще» на телефоні: заокруглена панель з анімацією. Унизу знову «Гаманці».",
        "Деталі позиції плавно розкриваються та згортаються.",
        "Виправлено стрибки капіталу гаманців: ціни токенів звіряються з CoinGecko, помилкові точки в історії виправлено.",
      ],
      en: [
        "New “More” menu on phones: a rounded animated sheet. “Wallets” is back in the bottom bar.",
        "Position details unfold and fold smoothly.",
        "Fixed jumps in wallet capital: token prices are now cross-checked with CoinGecko and wrong history points are corrected.",
      ],
    },
  },
  {
    date: "2026-10-22",
    title: {
      ru: "Обновлённый дашборд",
      uk: "Оновлений дашборд",
      en: "Redesigned dashboard",
    },
    items: {
      ru: [
        "Блок капитала компактнее. Одна кнопка обновления обновляет выбранную вкладку: всё, кошельки или биржи.",
        "Во вкладке «Всё» появились лидеры роста и падения сразу по кошелькам и биржам.",
        "В длинном списке токенов показаны первые 10 строк, остальные по кнопке «Показать все». Плавающая кнопка быстро ведёт к нужному разделу.",
        "Спам-токены идут в конце списка с пометкой «Спам». Остатки известных монет (например, USDC) спамом не считаются.",
        "Синхронизация идёт в фоне: во время обновления можно переходить на другие страницы.",
      ],
      uk: [
        "Блок капіталу компактніший. Одна кнопка оновлення оновлює вибрану вкладку: все, гаманці або біржі.",
        "У вкладці «Все» з’явилися лідери зростання та падіння одразу по гаманцях і біржах.",
        "У довгому списку токенів показано перші 10 рядків, решта за кнопкою «Показати все». Плаваюча кнопка швидко веде до потрібного розділу.",
        "Спам-токени йдуть наприкінці списку з позначкою «Спам». Залишки відомих монет (наприклад, USDC) спамом не вважаються.",
        "Синхронізація йде у фоні: під час оновлення можна переходити на інші сторінки.",
      ],
      en: [
        "A more compact capital block. One refresh button updates the selected tab: All, Wallets or Exchanges.",
        "The All tab now shows top gainers and losers across wallets and exchanges together.",
        "Long token lists show the first 10 rows, the rest behind “Show all”. A floating button jumps to the section you need.",
        "Spam tokens go to the end of the list with a “Spam” badge. Balances of well-known coins (such as USDC) are no longer treated as spam.",
        "Syncing runs in the background: you can open other pages while it works.",
      ],
    },
  },
  {
    date: "2026-10-22",
    title: {
      ru: "Депозиты и выводы бирж, компактные страницы",
      uk: "Депозити та виводи бірж, компактні сторінки",
      en: "Exchange deposits and withdrawals, compact pages",
    },
    items: {
      ru: [
        "Появилась история депозитов и выводов бирж: Binance, Bybit, OKX, Hyperliquid.",
        "Страницы кошельков и бирж стали компактнее. Описание спрятано за значком «i», кнопка добавления справа от заголовка.",
        "На компьютере крупнее шрифты, блоки и логотипы бирж. Отдельный кошелёк обновляется в фоне.",
        "Позиции на телефоне: карточки компактнее (около трёх на экран), фильтры собраны в одну панель со сбросом.",
      ],
      uk: [
        "З’явилася історія депозитів та виводів бірж: Binance, Bybit, OKX, Hyperliquid.",
        "Сторінки гаманців і бірж стали компактнішими. Опис сховано за значком «i», кнопка додавання праворуч від заголовка.",
        "На комп’ютері більші шрифти, блоки та логотипи бірж. Окремий гаманець оновлюється у фоні.",
        "Позиції на телефоні: картки компактніші (близько трьох на екран), фільтри зібрано в одну панель зі скиданням.",
      ],
      en: [
        "Added deposit and withdrawal history for exchanges: Binance, Bybit, OKX, Hyperliquid.",
        "Wallets and Exchanges pages are more compact. The description sits behind an “i” icon, the add button is next to the title.",
        "Larger type, blocks and exchange logos on desktop. A single wallet refreshes in the background.",
        "Positions on phones: denser cards (about three per screen), filters in one panel with a reset button.",
      ],
    },
  },
  {
    date: "2026-10-22",
    title: {
      ru: "Ценовые оповещения в реальном времени",
      uk: "Цінові сповіщення в реальному часі",
      en: "Real-time price alerts",
    },
    items: {
      ru: [
        "Оповещения проверяются на сервере постоянно: цены Binance и Gate обновляются каждые 20 секунд.",
        "Порог можно задать от 0,1%, период — от 1 минуты.",
      ],
      uk: [
        "Сповіщення перевіряються на сервері постійно: ціни Binance і Gate оновлюються кожні 20 секунд.",
        "Поріг можна задати від 0,1%, період — від 1 хвилини.",
      ],
      en: [
        "Alerts are checked on the server all the time: Binance and Gate prices refresh every 20 seconds.",
        "The threshold can be as low as 0.1% and the period as short as 1 minute.",
      ],
    },
  },
  {
    date: "2026-10-21",
    title: {
      ru: "Криптолента: быстрее и надёжнее",
      uk: "Криптострічка: швидше та надійніше",
      en: "Crypto feed: faster and more reliable",
    },
    items: {
      ru: [
        "Новые посты появляются за несколько секунд, пока лента открыта. Если вы не на странице, она догоняет пропущенное сразу при открытии.",
        "Если долго ничего не делать на странице, обновление замедляется, а затем останавливается с кнопкой «Обновить».",
        "Картинки в постах ограничены по размеру и подгоняются под рамку. Шапка и фильтры компактнее, лента шире.",
        "Telegram-лента работает на собственном сервере и сама восстанавливается после сбоев.",
      ],
      uk: [
        "Нові пости з’являються за кілька секунд, поки стрічка відкрита. Якщо вас немає на сторінці, вона наздоганяє пропущене одразу при відкритті.",
        "Якщо довго нічого не робити на сторінці, оновлення сповільнюється, а потім зупиняється з кнопкою «Оновити».",
        "Картинки в постах обмежені за розміром і підганяються під рамку. Шапка й фільтри компактніші, стрічка ширша.",
        "Telegram-стрічка працює на власному сервері та сама відновлюється після збоїв.",
      ],
      en: [
        "New posts appear within seconds while the feed is open. If you were away, it catches up the moment you open it.",
        "If you leave the page idle, refreshing slows down and then stops with an “Update” button.",
        "Post pictures are size-limited and fit their frame. The header and filters are more compact and the feed is wider.",
        "The Telegram feed runs on our own server and recovers by itself after failures.",
      ],
    },
  },
  {
    date: "2026-10-20",
    title: {
      ru: "Биржи в приложении",
      uk: "Біржі в застосунку",
      en: "Exchanges in the app",
    },
    items: {
      ru: [
        "Подключение бирж Binance, Bybit, Gate, OKX и Hyperliquid, а также Aster (включая Shield Mode). Доступ открыт по списку.",
        "На обзоре монеты кошельков и бирж объединены в один список, с логотипами и изменением цены за сутки.",
        "Позиции одной монеты на разных биржах показываются рядом, с общим размером и общим нереализованным PnL. Логотипы монет подтягиваются надёжнее.",
        "Без зрителя данные бирж обновляются раз в 30 минут, при открытой странице — быстро.",
      ],
      uk: [
        "Підключення бірж Binance, Bybit, Gate, OKX і Hyperliquid, а також Aster (зокрема Shield Mode). Доступ відкрито за списком.",
        "На огляді монети гаманців і бірж об’єднано в один список, з логотипами та зміною ціни за добу.",
        "Позиції однієї монети на різних біржах показуються поруч, із загальним розміром і загальним нереалізованим PnL. Логотипи монет підтягуються надійніше.",
        "Без глядача дані бірж оновлюються раз на 30 хвилин, при відкритій сторінці — швидко.",
      ],
      en: [
        "Connect Binance, Bybit, Gate, OKX and Hyperliquid, plus Aster (including Shield Mode). Access is by invitation.",
        "The overview merges wallet and exchange coins into one list, with logos and 24-hour change.",
        "Positions in the same coin on different exchanges are shown side by side with a combined size and unrealized PnL. Coin logos load more reliably.",
        "With nobody watching, exchange data refreshes every 30 minutes; with the page open it is fast.",
      ],
    },
  },
  {
    date: "2026-10-09",
    title: {
      ru: "Позиции: PnL, funding и комиссии",
      uk: "Позиції: PnL, funding і комісії",
      en: "Positions: PnL, funding and fees",
    },
    items: {
      ru: [
        "У позиции видны вход, маркировка, безубыточность, расстояние до ликвидации и следующий funding.",
        "Реализованный PnL считается с учётом funding и комиссий. Появились статистика позиций, поиск и фильтры.",
        "Добавлены Gate, OKX, BingX, Bitget (Classic и Unified) и Aster.",
      ],
      uk: [
        "У позиції видно вхід, маркування, беззбитковість, відстань до ліквідації та наступний funding.",
        "Реалізований PnL рахується з урахуванням funding і комісій. З’явилися статистика позицій, пошук і фільтри.",
        "Додано Gate, OKX, BingX, Bitget (Classic та Unified) і Aster.",
      ],
      en: [
        "A position shows entry, mark, break-even, distance to liquidation and next funding.",
        "Realized PnL accounts for funding and fees. Added position statistics, search and filters.",
        "Added Gate, OKX, BingX, Bitget (Classic and Unified) and Aster.",
      ],
    },
  },
  {
    date: "2026-10-06",
    title: {
      ru: "Первые биржи: балансы и позиции",
      uk: "Перші біржі: баланси та позиції",
      en: "First exchanges: balances and positions",
    },
    items: {
      ru: [
        "Подключение биржевых аккаунтов только для чтения (ключи шифруются): балансы и открытые позиции.",
        "График капитала по кошелькам и биржам и фоновое обновление данных.",
      ],
      uk: [
        "Підключення біржових акаунтів лише для читання (ключі шифруються): баланси та відкриті позиції.",
        "Графік капіталу по гаманцях і біржах та фонове оновлення даних.",
      ],
      en: [
        "Connect exchange accounts in read-only mode (keys are encrypted): balances and open positions.",
        "A capital chart across wallets and exchanges, with background data refresh.",
      ],
    },
  },
  {
    date: "2026-10-03",
    title: {
      ru: "Вход через Google и Telegram",
      uk: "Вхід через Google і Telegram",
      en: "Sign in with Google and Telegram",
    },
    items: {
      ru: [
        "Можно входить через Google или Telegram, а Telegram — привязать к существующему аккаунту.",
        "Вход и уведомления через Telegram объединены в одно подключение.",
      ],
      uk: [
        "Можна входити через Google або Telegram, а Telegram — прив’язати до наявного акаунта.",
        "Вхід і сповіщення через Telegram об’єднано в одне підключення.",
      ],
      en: [
        "You can sign in with Google or Telegram, and link Telegram to an existing account.",
        "Telegram sign-in and notifications now use a single connection.",
      ],
    },
  },
  {
    date: "2026-10-02",
    title: {
      ru: "Малые остатки и альбомы в ленте",
      uk: "Малі залишки та альбоми в стрічці",
      en: "Small balances and feed albums",
    },
    items: {
      ru: [
        "Фильтр скрывает кошельки и токены с остатком меньше доллара.",
        "Фотоальбомы Telegram в ленте показываются одной каруселью.",
      ],
      uk: [
        "Фільтр ховає гаманці та токени із залишком менше долара.",
        "Фотоальбоми Telegram у стрічці показуються однією каруселлю.",
      ],
      en: [
        "A filter hides wallets and tokens with a balance under one dollar.",
        "Telegram photo albums appear in the feed as a single carousel.",
      ],
    },
  },
  {
    date: "2026-09-29",
    title: {
      ru: "Hyperliquid",
      uk: "Hyperliquid",
      en: "Hyperliquid",
    },
    items: {
      ru: ["Балансы и история транзакций кошельков Hyperliquid (HyperCore и HyperEVM)."],
      uk: ["Баланси та історія транзакцій гаманців Hyperliquid (HyperCore і HyperEVM)."],
      en: ["Balances and transaction history for Hyperliquid wallets (HyperCore and HyperEVM)."],
    },
  },
];
