import { describe, it, expect, vi } from 'vitest';
import { TriggerDirection } from '@prisma/client';

// Ізолюємо чисті функції від реального Prisma-клієнта (модуль імпортує prisma на верхньому рівні).
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import {
  evaluateTrigger,
  evaluatePriceTargetTrigger,
  buildPriceQueries,
  resolveBalancePrice,
} from '@/lib/cron/price-updater';

// ─────────────────────────────────────────
// Хелпери-фабрики (детерміновані, без I/O)
// ─────────────────────────────────────────

const NOW = new Date('2024-01-01T12:00:00.000Z');
// Перевищує будь-який розумний interval → інтервальний gate завжди пройдено
const LONG_AGO = new Date('2024-01-01T00:00:00.000Z');

type PercentTrigger = Parameters<typeof evaluateTrigger>[0];

function makePercentTrigger(over: Partial<PercentTrigger> = {}): PercentTrigger {
  return {
    lastPrice: 100,
    lastCheckedAt: LONG_AGO,
    interval: 60,
    threshold: 5,
    direction: TriggerDirection.BOTH,
    user: { telegramChatId: '123', isBlocked: false },
    ...over,
  };
}

type TargetTrigger = Parameters<typeof evaluatePriceTargetTrigger>[0];

function makeTargetTrigger(over: Partial<TargetTrigger> = {}): TargetTrigger {
  return {
    lastPrice: 90,
    targetPrice: 100,
    direction: TriggerDirection.UP,
    user: { telegramChatId: '123', isBlocked: false },
    ...over,
  };
}

interface BalanceRowLike {
  id: string;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  balance: number;
  usdValue: number;
  priceUsd: number;
  priceChange24h: number;
  coingeckoId: string | null;
}

function makeBalance(over: Partial<BalanceRowLike> = {}): BalanceRowLike {
  return {
    id: 'b1',
    chainName: 'ethereum',
    tokenAddress: '0xabc',
    tokenSymbol: 'TKN',
    balance: 1,
    usdValue: 1,
    priceUsd: 1,
    priceChange24h: 0,
    coingeckoId: null,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════
// evaluateTrigger — PERCENT тригер (Δ% за інтервал)
// ═════════════════════════════════════════════════════════════════

describe('evaluateTrigger (PERCENT)', () => {
  it('lastPrice === null → ініціалізація базової ціни без сповіщення', () => {
    const r = evaluateTrigger(makePercentTrigger({ lastPrice: null }), 100, NOW);
    expect(r).toEqual({ shouldNotify: false, shouldUpdate: true, delta: 0 });
  });

  it('у межах інтервалу (elapsed < interval) → нічого не робимо', () => {
    const lastCheckedAt = new Date(NOW.getTime() - 30 * 60 * 1000); // 30хв тому
    const r = evaluateTrigger(makePercentTrigger({ interval: 60, lastCheckedAt }), 200, NOW);
    expect(r).toEqual({ shouldNotify: false, shouldUpdate: false, delta: 0 });
  });

  it('lastCheckedAt === null → elapsed = Infinity → інтервал пройдено', () => {
    const r = evaluateTrigger(makePercentTrigger({ lastCheckedAt: null }), 110, NOW);
    expect(r.shouldUpdate).toBe(true);
    expect(r.shouldNotify).toBe(true);
    expect(r.delta).toBeCloseTo(10);
  });

  it('поріг рівно на межі (|delta| === threshold) → спрацьовує (>=)', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ lastPrice: 100, threshold: 5 }),
      105, // delta = +5.00 == threshold
      NOW,
    );
    expect(r.delta).toBeCloseTo(5);
    expect(r.shouldNotify).toBe(true);
  });

  it('delta трохи нижче порога → оновлюємо, але не сповіщаємо', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ lastPrice: 100, threshold: 5 }),
      104.9, // delta = +4.9 < 5
      NOW,
    );
    expect(r.shouldNotify).toBe(false);
    expect(r.shouldUpdate).toBe(true);
  });

  it('direction UP + зростання → сповіщає', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ direction: TriggerDirection.UP, lastPrice: 100 }),
      120,
      NOW,
    );
    expect(r.shouldNotify).toBe(true);
    expect(r.delta).toBeCloseTo(20);
  });

  it('direction UP + падіння → НЕ сповіщає (delta від’ємна)', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ direction: TriggerDirection.UP, lastPrice: 100 }),
      90,
      NOW,
    );
    expect(r.delta).toBeCloseTo(-10);
    expect(r.shouldNotify).toBe(false);
    expect(r.shouldUpdate).toBe(true);
  });

  it('direction DOWN + падіння → сповіщає', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ direction: TriggerDirection.DOWN, lastPrice: 100 }),
      80,
      NOW,
    );
    expect(r.shouldNotify).toBe(true);
    expect(r.delta).toBeCloseTo(-20);
  });

  it('direction DOWN + зростання → НЕ сповіщає', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ direction: TriggerDirection.DOWN, lastPrice: 100 }),
      120,
      NOW,
    );
    expect(r.shouldNotify).toBe(false);
  });

  it('немає telegramChatId → не сповіщає (але оновлює)', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ user: { telegramChatId: null, isBlocked: false } }),
      200,
      NOW,
    );
    expect(r.shouldNotify).toBe(false);
    expect(r.shouldUpdate).toBe(true);
  });

  it('користувач заблокований → не сповіщає', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ user: { telegramChatId: '123', isBlocked: true } }),
      200,
      NOW,
    );
    expect(r.shouldNotify).toBe(false);
  });

  it('від’ємне значення: ціна впала вдвічі → delta = -50', () => {
    const r = evaluateTrigger(makePercentTrigger({ lastPrice: 100 }), 50, NOW);
    expect(r.delta).toBeCloseTo(-50);
    expect(r.shouldNotify).toBe(true); // BOTH + |−50| >= 5
  });

  it('нульова поточна ціна → delta = -100 (DOWN спрацьовує)', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ direction: TriggerDirection.DOWN, lastPrice: 100 }),
      0,
      NOW,
    );
    expect(r.delta).toBeCloseTo(-100);
    expect(r.shouldNotify).toBe(true);
  });

  it('поріг 0 → будь-яка ненульова зміна сповіщає', () => {
    const r = evaluateTrigger(
      makePercentTrigger({ threshold: 0, lastPrice: 100 }),
      102,
      NOW,
    );
    expect(r.shouldNotify).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// evaluatePriceTargetTrigger — PRICE_TARGET (перетин UP / DOWN)
// ═════════════════════════════════════════════════════════════════

describe('evaluatePriceTargetTrigger (PRICE_TARGET)', () => {
  it('lastPrice === null → false', () => {
    expect(evaluatePriceTargetTrigger(makeTargetTrigger({ lastPrice: null }), 101)).toBe(false);
  });

  it('targetPrice === null → false', () => {
    expect(evaluatePriceTargetTrigger(makeTargetTrigger({ targetPrice: null }), 101)).toBe(false);
  });

  it('немає telegramChatId → false', () => {
    const t = makeTargetTrigger({ user: { telegramChatId: null, isBlocked: false } });
    expect(evaluatePriceTargetTrigger(t, 101)).toBe(false);
  });

  it('користувач заблокований → false', () => {
    const t = makeTargetTrigger({ user: { telegramChatId: '123', isBlocked: true } });
    expect(evaluatePriceTargetTrigger(t, 101)).toBe(false);
  });

  it('UP: перетин знизу вгору (last < target, current > target) → true', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.UP, lastPrice: 90, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 101)).toBe(true);
  });

  it('UP: межа — current === target → true (>=)', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.UP, lastPrice: 90, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 100)).toBe(true);
  });

  it('UP: перетину не сталось (обидві нижче цілі) → false', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.UP, lastPrice: 95, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 99)).toBe(false);
  });

  it('UP: ціна вже була вище цілі → false (немає перетину)', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.UP, lastPrice: 105, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 110)).toBe(false);
  });

  it('UP: рух вниз через ціль ігнорується для напрямку UP → false', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.UP, lastPrice: 110, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 95)).toBe(false);
  });

  it('DOWN: перетин зверху вниз (last > target, current < target) → true', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.DOWN, lastPrice: 110, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 99)).toBe(true);
  });

  it('DOWN: межа — current === target → true (<=)', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.DOWN, lastPrice: 110, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 100)).toBe(true);
  });

  it('DOWN: перетину не сталось (обидві вище цілі) → false', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.DOWN, lastPrice: 105, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 102)).toBe(false);
  });

  it('BOTH: перетин вгору → true', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.BOTH, lastPrice: 90, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 101)).toBe(true);
  });

  it('BOTH: перетин вниз → true', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.BOTH, lastPrice: 110, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 99)).toBe(true);
  });

  it('без руху (ціна не дійшла до цілі) → false', () => {
    const t = makeTargetTrigger({ direction: TriggerDirection.BOTH, lastPrice: 90, targetPrice: 100 });
    expect(evaluatePriceTargetTrigger(t, 95)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// buildPriceQueries — дедуплікація запитів цін (pure)
// ═════════════════════════════════════════════════════════════════

describe('buildPriceQueries', () => {
  it('порожній масив балансів → порожня мапа', () => {
    expect(buildPriceQueries([]).size).toBe(0);
  });

  it('нативний токен (tokenAddress === "") → ключ ::native, isNative=true', () => {
    const q = buildPriceQueries([makeBalance({ chainName: 'ethereum', tokenAddress: '' })]);
    const entry = q.get('ethereum::native');
    expect(entry).toBeDefined();
    expect(entry!.isNative).toBe(true);
    expect(entry!.contractAddress).toBeUndefined();
  });

  it('ERC-20 токен → isNative=false, contractAddress збережено', () => {
    const q = buildPriceQueries([makeBalance({ chainName: 'bsc', tokenAddress: '0xdead' })]);
    const entry = q.get('bsc::0xdead');
    expect(entry!.isNative).toBe(false);
    expect(entry!.contractAddress).toBe('0xdead');
  });

  it('дублікати (той самий chain+address) згортаються в один запит', () => {
    const q = buildPriceQueries([
      makeBalance({ id: 'a', chainName: 'ethereum', tokenAddress: '0xabc' }),
      makeBalance({ id: 'b', chainName: 'ethereum', tokenAddress: '0xabc' }),
    ]);
    expect(q.size).toBe(1);
  });

  it('той самий токен на різних ланцюгах → окремі записи', () => {
    const q = buildPriceQueries([
      makeBalance({ chainName: 'ethereum', tokenAddress: '0xabc' }),
      makeBalance({ chainName: 'polygon', tokenAddress: '0xabc' }),
    ]);
    expect(q.size).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════
// resolveBalancePrice — пріоритет price-feed → CoinGecko cache (pure)
// ═════════════════════════════════════════════════════════════════

describe('resolveBalancePrice', () => {
  it('price-feed має ціну → повертає її (пріоритет)', () => {
    const b = makeBalance({ chainName: 'ethereum', tokenAddress: '0xabc', coingeckoId: 'tkn' });
    const feed = new Map([['ethereum::0xabc', { price: 2, change24h: 10 }]]);
    const cg = new Map([['tkn', { price: 999, change24h: -50 }]]);
    expect(resolveBalancePrice(b, feed, cg)).toEqual({ price: 2, change24h: 10 });
  });

  it('price-feed порожній, але є coingeckoId у кеші → бере з CoinGecko', () => {
    const b = makeBalance({ chainName: 'ethereum', tokenAddress: '0xabc', coingeckoId: 'tkn' });
    const cg = new Map([['tkn', { price: 5, change24h: 3 }]]);
    expect(resolveBalancePrice(b, new Map(), cg)).toEqual({ price: 5, change24h: 3 });
  });

  it('немає ні feed, ні coingeckoId → null', () => {
    const b = makeBalance({ coingeckoId: null });
    expect(resolveBalancePrice(b, new Map(), new Map())).toBeNull();
  });

  it('є coingeckoId, але його немає в кеші → null', () => {
    const b = makeBalance({ coingeckoId: 'missing' });
    expect(resolveBalancePrice(b, new Map(), new Map())).toBeNull();
  });
});
