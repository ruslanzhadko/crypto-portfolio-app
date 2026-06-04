import { describe, it, expect } from 'vitest';
import {
  formatUsd,
  formatNumber,
  formatPercent,
  formatTokenBalance,
  shortAddress,
  formatDate,
  formatRelative,
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
  });
  it('явний minimumFractionDigits', () => {
    expect(formatUsd(10, { minimumFractionDigits: 0 })).toBe('$10');
  });
  it('NaN/Infinity → $0.00 (guard)', () => {
    expect(formatUsd(Number.NaN)).toBe('$0.00');
    expect(formatUsd(Infinity)).toBe('$0.00');
  });
});

describe('formatNumber', () => {
  it('форматує з роздільником тисяч', () => {
    expect(formatNumber(1234.5678)).toBe('1,234.5678');
  });
  it('NaN → "0"', () => {
    expect(formatNumber(Number.NaN)).toBe('0');
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

describe('shortAddress', () => {
  it('довга адреса скорочується', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...345678');
  });
  it('коротка адреса повертається як є', () => {
    expect(shortAddress('0x1234')).toBe('0x1234');
  });
  it('порожній рядок → ""', () => {
    expect(shortAddress('')).toBe('');
  });
});

describe('formatDate', () => {
  it('форматує дату за патерном', () => {
    expect(formatDate('2024-01-15T00:00:00.000Z', 'yyyy-MM-dd')).toBe('2024-01-15');
  });
});

describe('formatRelative', () => {
  it('null/undefined → "Ніколи"', () => {
    expect(formatRelative(null)).toBe('Ніколи');
    expect(formatRelative(undefined)).toBe('Ніколи');
  });
  it('порожній рядок → "Ніколи"', () => {
    expect(formatRelative('')).toBe('Ніколи');
  });
  it('валідна дата → повертає рядок', () => {
    expect(typeof formatRelative(new Date('2020-01-01T00:00:00.000Z'))).toBe('string');
  });
});
