import { describe, expect, it } from 'vitest';
import { tradeDirectionKey, tradeDirectionLabel } from './trade-direction';

describe('trade direction labels', () => {
  it('maps venue directions to message keys and keeps unknown ones as written', () => {
    expect(tradeDirectionKey('Open Long')).toBe('openLong');
    expect(tradeDirectionKey(' close short ')).toBe('closeShort');
    expect(tradeDirectionKey('Long > Short')).toBe('longToShort');
    expect(tradeDirectionKey('Sell')).toBe('sell');
    expect(tradeDirectionKey('Auto-Deleveraging')).toBeNull();
    expect(tradeDirectionLabel('Buy', (key) => `t:${key}`)).toBe('t:buy');
    expect(tradeDirectionLabel('Auto-Deleveraging', (key) => `t:${key}`)).toBe('Auto-Deleveraging');
  });
});
