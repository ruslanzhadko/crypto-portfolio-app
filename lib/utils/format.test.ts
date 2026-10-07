import { describe, it, expect } from 'vitest';
import {
  formatUsd,
  formatPercent,
  formatTokenBalance,
  formatRelativeCompact,
} from '@/lib/utils/format';

describe('formatUsd', () => {
  it('звичайне значення → 2 знаки', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
  });
  it('значення < 1 → 6 знаків після коми', () => {
    expect(formatUsd(0.123456)).toBe('$0.123456');
  });
  it('compact для великих сум', () => {
    expect(formatUsd(1_000_000, { compact: true })).toBe('$1.00M');
    expect(formatUsd(2_900, { compact: true })).toBe('$2.90K');
  });
  it('явний minimumFractionDigits', () => {
    expect(formatUsd(10, { minimumFractionDigits: 0 })).toBe('$10');
  });
  it('NaN/Infinity → $0.00 (guard)', () => {
    expect(formatUsd(Number.NaN)).toBe('$0.00');
    expect(formatUsd(Infinity)).toBe('$0.00');
  });
});

describe('formatPercent', () => {
  it('додатнє → знак +', () => {
    expect(formatPercent(5)).toBe('+5.00%');
  });
  it('від’ємне → без +', () => {
    expect(formatPercent(-3.5)).toBe('-3.50%');
  });
  it('нуль → без знака', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });
  it('NaN → "0%"', () => {
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});

describe('formatTokenBalance', () => {
  it('нуль → "0"', () => {
    expect(formatTokenBalance(0)).toBe('0');
  });
  it('дуже мала кількість → експоненційний запис', () => {
    expect(formatTokenBalance(0.00005)).toBe('5.00e-5');
  });
  it('< 1 → 6 знаків', () => {
    expect(formatTokenBalance(0.5)).toBe('0.500000');
  });
  it('< 1000 → 4 знаки', () => {
    expect(formatTokenBalance(5.1234)).toBe('5.1234');
  });
  it('>= 1000 → formatNumber з 2 знаками', () => {
    expect(formatTokenBalance(1500.5)).toBe('1,500.5');
  });
  it('NaN → "0"', () => {
    expect(formatTokenBalance(Number.NaN)).toBe('0');
  });
});

describe('formatRelativeCompact', () => {
  const seventeenMinutesAgo = () => new Date(Date.now() - 17 * 60_000);

  it('uses compact minute units for each supported locale', () => {
    expect(formatRelativeCompact(seventeenMinutesAgo(), 'en')).toBe('17 min ago');
    expect(formatRelativeCompact(seventeenMinutesAgo(), 'ru')).toBe('17 мин назад');
    expect(formatRelativeCompact(seventeenMinutesAgo(), 'uk')).toBe('17 хв тому');
  });

  it('keeps the existing relative format for longer intervals', () => {
    expect(formatRelativeCompact(new Date(Date.now() - 2 * 60 * 60_000), 'en')).toBe('about 2 hours ago');
  });
});
