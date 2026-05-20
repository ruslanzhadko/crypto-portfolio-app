# CodeRabbitAI — виправлення

Всі знайдені та застосовані правки від code review бота. Одна правка пропущена (обґрунтування внизу).

---

## 1. Некоректна умова блокування адміністратора

**Файл:** `app/api/admin/users/[id]/route.ts` — рядок 38  
**Серйозність:** 🟠 Major

**Проблема:** Перевірка `isBlocked !== undefined` спрацьовувала і для `false`, тому запит `{ isBlocked: false }` (розблокування адміна) повертав `403 FORBIDDEN`. Адміністратора неможливо було розблокувати.

```ts
// До
if (parsed.data.isBlocked !== undefined && target.role === 'ADMIN') {

// Після
if (parsed.data.isBlocked === true && target.role === 'ADMIN') {
```

---

## 2. HTML-injection через `firstName` у Telegram-повідомленнях

**Файли:**
- `app/api/telegram/webhook/route.ts`
- `scripts/telegram-poll.ts`

**Серйозність:** 🟠 Major

**Проблема:** `firstName` з Telegram API вставлявся напряму в HTML-повідомлення (`parse_mode: 'HTML'`). Ім'я що містить `<`, `>` або `&` ламало розмітку повідомлення.

```ts
// Додано в обох файлах
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// До
const greeting = firstName ? `Привіт, ${firstName}!` : 'Привіт!';

// Після
const greeting = firstName ? `Привіт, ${escapeHtml(firstName)}!` : 'Привіт!';
```

---

## 3. Вічний skeleton при помилці завантаження логів

**Файл:** `components/admin/admin-logs-table.tsx`  
**Серйозність:** 🟠 Major

**Проблема:** При `!res.ok` або мережевій помилці функція `load` робила ранній `return`, залишаючи `items === null`. UI показував skeleton нескінченно.

```ts
// До
const res = await fetch(...);
if (!res.ok) return;  // items залишається null → вічний skeleton

// Після
try {
  const res = await fetch(...);
  if (!res.ok) throw new Error();
  // ...setItems(data.logs)
} catch {
  setItems([]);      // → показує empty state
  setTotal(0);
  setTotalPages(0);
}
```

---

## 4. Кнопка "Оновити" webhook назавжди заблокована

**Файл:** `components/admin/telegram-webhook-card.tsx`  
**Серйозність:** 🟠 Major

**Проблема:** `fetchStatus` не мав `try/catch/finally`. При мережевій помилці `setLoading(false)` не викликався — кнопка "Оновити" залишалась задізейбленою назавжди.

```ts
// До
async function fetchStatus() {
  setLoading(true);
  const res = await fetch('/api/admin/telegram');  // може кинути виняток
  if (res.ok) { ... }
  setLoading(false);  // не виконається при помилці
}

// Після
async function fetchStatus() {
  setLoading(true);
  try {
    const res = await fetch('/api/admin/telegram');
    if (res.ok) {
      const data = (await res.json()) as { webhook: WebhookInfo };
      setInfo(data.webhook);
    } else {
      setInfo(null);
    }
  } catch {
    setInfo(null);
  } finally {
    setLoading(false);  // виконується завжди
  }
}
```

---

## 5. Мережева помилка у таблиці юзерів без повідомлення

**Файл:** `components/admin/users-table.tsx`  
**Серйозність:** 🟠 Major (×2 проблеми)

### 5a. `patch` без `try/catch`

**Проблема:** Якщо `fetch` кидав виняток (offline/timeout), React `startTransition` мовчки його ковтав — юзер не бачив жодного повідомлення про помилку.

```ts
// Після
async function patch(...) {
  try {
    const res = await fetch(...);
    if (!res.ok) { toast({ variant: 'destructive', ... }); return false; }
    toast({ title: successMsg });
    return true;
  } catch {
    toast({ variant: 'destructive', title: 'Помилка мережі', description: 'Спробуйте ще раз.' });
    return false;
  }
}
```

### 5b. `load` без `try/catch` (бонус — не флагований CodeRabbitAI)

Та сама проблема що в `admin-logs-table.tsx` — `!res.ok` залишав `users === null` → skeleton вічно. Виправлено аналогічно.

---

## 6. `aria-label` для іконкових кнопок

**Файл:** `components/admin/users-table.tsx` — рядки 189–223  
**Серйозність:** 🟡 Minor

**Проблема:** Три кнопки дій (зміна ролі, блокування, видалення) не мали `aria-label`. На мобільному текст прихований (`hidden md:inline`) — screen reader нічого не озвучував.

```tsx
// Кнопка ролі — вже мала title, додано aria-label
<Button aria-label={u.role === 'ADMIN' ? 'Понизити до USER' : 'Підвищити до ADMIN'} ...>

// Кнопка блокування
<Button aria-label={u.isBlocked ? 'Розблокувати' : 'Заблокувати'} ...>

// Кнопка видалення — не мала ні title ні aria-label
<Button aria-label="Видалити користувача" ...>
```

---

## 7. Race condition при завантаженні ціни токена

**Файл:** `components/alerts/trigger-form.tsx` — рядки 66–85  
**Серйозність:** 🟠 Major

**Проблема:** При швидкому перемиканні Token A → Token B відповідь від повільного запиту A могла прийти пізніше і перезаписати ціну вже обраного токена B.

**Додаткова помилка в пропозиції CodeRabbitAI:** їхній фікс залишав `.catch(() => setTokenCurrentPrice(null))` без змін — `AbortError` теж потрапляв у catch і очищав ціну вже нового токена. `.finally` так само вимикав `priceLoading` нового запиту.

```ts
// Після (правильний фікс)
const controller = new AbortController();
setPriceLoading(true);
fetch(`/api/market/${selectedToken.tokenId}`, { signal: controller.signal })
  .then(...)
  .catch((err: unknown) => {
    // Ігноруємо AbortError — це навмисне скасування, не помилка
    if ((err as { name?: string }).name !== 'AbortError') setTokenCurrentPrice(null);
  })
  .finally(() => {
    // Не вимикаємо loading якщо запит скасований (новий запит вже йде)
    if (!controller.signal.aborted) setPriceLoading(false);
  });
return () => controller.abort();
```

---

## 8. Некоректний напрямок тригера при відсутній ціні

**Файл:** `components/alerts/trigger-form.tsx` — рядок 134  
**Серйозність:** 🟠 Major

**Проблема:** `direction: Number(targetPrice) >= (tokenCurrentPrice ?? 0) ? 'UP' : 'DOWN'` — якщо ціна не завантажилась (`tokenCurrentPrice === null`), fallback `?? 0` давав `UP` для будь-якої позитивної цілі, що є некоректним напрямком.

```ts
// Додана валідація перед startTransition
if (triggerType === 'PRICE_TARGET' && tokenCurrentPrice === null) {
  toast({ variant: 'destructive', title: 'Поточна ціна недоступна' });
  return;
}

// Прибрано ?? 0 — після валідації tokenCurrentPrice гарантовано не null
direction: Number(targetPrice) >= tokenCurrentPrice! ? 'UP' : 'DOWN',
```

---

## 9. Auth bypass для webhook — занадто широкий

**Файл:** `lib/auth/config.ts` — рядок 62  
**Серйозність:** 🟠 Major

**Проблема:** `startsWith('/api/telegram/webhook')` відкривав auth bypass для будь-яких потенційних підшляхів. Краща практика — точна перевірка.

```ts
// До
pathname.startsWith('/api/telegram/webhook') ||

// Після
pathname === '/api/telegram/webhook' ||
```

> **Примітка:** У поточній файловій структурі Next.js App Router субшляхів не існує, тому реального security hole не було. Але точний match — правильна практика.

---

## 10. Некоректні truthy-перевірки числових полів

**Файл:** `app/(dashboard)/market/[tokenId]/page.tsx`  
**Серйозність:** 🟡 Minor

**Проблема:** `coin.high24h ? ... : '—'` показував `'—'` якщо значення рівно `0`. Для крипти практично неможливо, але семантично неправильно.

```tsx
// До
value={coin.high24h ? formatUsd(coin.high24h) : '—'}
value={coin.low24h ? formatUsd(coin.low24h) : '—'}
subtext={coin.ath ? `ATH: ${formatUsd(coin.ath)}` : undefined}

// Після
value={coin.high24h !== null ? formatUsd(coin.high24h) : '—'}
value={coin.low24h !== null ? formatUsd(coin.low24h) : '—'}
subtext={coin.ath !== null ? `ATH: ${formatUsd(coin.ath)}` : undefined}
```

Додатково виправлено `coin.marketCap` і `coin.volume24h` (рядки 117–121) за тим самим патерном — CodeRabbitAI не флагував, але проблема ідентична.

---

## Пропущена правка

### `lib/utils/validators.ts` — `superRefine` на `triggerUpdateSchema`

**Причина пропуску:** PATCH на тригер викликається тільки з `trigger-card.tsx` і завжди передає лише `{ isActive: boolean }`. Жодних мішаних комбінацій (`targetPrice + threshold + direction: BOTH`) з UI не надходить. `triggerCreateSchema` вже використовує `discriminatedUnion` що захищає інваріанти при **створенні**. Додавання складного `superRefine` — over-engineering без реальної загрози, з maintenance-overhead.

---

## Зведена таблиця

| # | Файл | Тип | Статус |
|---|---|---|---|
| 1 | `api/admin/users/[id]/route.ts` | Логічна помилка (блокування адміна) | ✅ |
| 2 | `api/telegram/webhook/route.ts` | HTML-injection (firstName) | ✅ |
| 2 | `scripts/telegram-poll.ts` | HTML-injection (firstName) | ✅ |
| 3 | `components/admin/admin-logs-table.tsx` | Вічний skeleton | ✅ |
| 4 | `components/admin/telegram-webhook-card.tsx` | Заблокована кнопка | ✅ |
| 5a | `components/admin/users-table.tsx` | `patch` без try/catch | ✅ |
| 5b | `components/admin/users-table.tsx` | `load` без try/catch (бонус) | ✅ |
| 6 | `components/admin/users-table.tsx` | aria-label кнопок | ✅ |
| 7 | `components/alerts/trigger-form.tsx` | Race condition (AbortController) | ✅ |
| 8 | `components/alerts/trigger-form.tsx` | Напрямок від null ціни | ✅ |
| 9 | `lib/auth/config.ts` | Auth bypass — широкий startsWith | ✅ |
| 10 | `app/.../market/[tokenId]/page.tsx` | Truthy замість !== null | ✅ |
| — | `lib/utils/validators.ts` | superRefine (over-engineering) | ⏭️ Пропущено |
