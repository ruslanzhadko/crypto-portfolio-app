import { describe, it, expect } from 'vitest';
import { computePortfolioValue, computeShare, computePnL } from '@/lib/services/portfolio-math';

// ═════════════════════════════════════════════════════════════════
// computePortfolioValue — V = Σ (balance × price)
// ═════════════════════════════════════════════════════════════════

describe('computePortfolioValue', () => {
  it('порожній портфель → 0', () => {
    expect(computePortfolioValue([])).toBe(0);
  });

  it('усі нульові баланси → 0', () => {
    expect(computePortfolioValue([0, 0, 0])).toBe(0);
  });

  it('сума вартостей активів (balance × price)', () => {
    // 2×1500 + 10×0.5 + 100×1 = 3105
    expect(computePortfolioValue([2 * 1500, 10 * 0.5, 100 * 1])).toBe(3105);
  });

  it('один актив', () => {
    expect(computePortfolioValue([42.5])).toBe(42.5);
  });
});

// ═════════════════════════════════════════════════════════════════
// computeShare — частка активу у %
// ═════════════════════════════════════════════════════════════════

describe('computeShare', () => {
  it('звичайна частка', () => {
    expect(computeShare(25, 100)).toBe(25);
  });

  it('частина 0 → 0%', () => {
    expect(computeShare(0, 100)).toBe(0);
  });

  it('total = 0 (ділення на нуль) → 0', () => {
    expect(computeShare(50, 0)).toBe(0);
  });

  it('total від’ємний → 0 (guard)', () => {
    expect(computeShare(50, -10)).toBe(0);
  });

  it('весь портфель в одному активі → 100%', () => {
    expect(computeShare(100, 100)).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════
// computePnL — V_current − V_initial
// ═════════════════════════════════════════════════════════════════

describe('computePnL', () => {
  it('прибуток (+)', () => {
    expect(computePnL(150, 100)).toEqual({ absolute: 50, percent: 50 });
  });

  it('збиток (−) — від’ємний PnL', () => {
    expect(computePnL(80, 100)).toEqual({ absolute: -20, percent: -20 });
  });

  it('initial = 0 (ділення на нуль) → percent 0, absolute = current', () => {
    expect(computePnL(100, 0)).toEqual({ absolute: 100, percent: 0 });
  });

  it('обидва 0 → нулі', () => {
    expect(computePnL(0, 0)).toEqual({ absolute: 0, percent: 0 });
  });

  it('падіння на 75%', () => {
    expect(computePnL(50, 200)).toEqual({ absolute: -150, percent: -75 });
  });
});
