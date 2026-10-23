import { describe, expect, it } from 'vitest';
import { checkedPrice, verifiedCoingeckoId } from './reference-price';

describe('checkedPrice', () => {
  it('keeps a price close to the reference', () => {
    expect(checkedPrice(1.0012, 0.9999)).toBe(1.0012);
  });
  it('replaces a price far from the reference', () => {
    expect(checkedPrice(3.71, 0.9999)).toBe(0.9999);
    expect(checkedPrice(0, 0.9999)).toBe(0.9999);
  });
  it('keeps the observed price without a reference', () => {
    expect(checkedPrice(3.71, undefined)).toBe(3.71);
    expect(checkedPrice(3.71, 0)).toBe(3.71);
  });
});

describe('verifiedCoingeckoId', () => {
  it('maps Robinhood USDG by contract, case-insensitively, and nothing else', () => {
    expect(verifiedCoingeckoId('robinhood', '0x5FC5360D0400A0FD4F2AF552ADD042D716F1D168')).toBe('global-dollar');
    expect(verifiedCoingeckoId('ethereum', '0x5fc5360d0400a0fd4f2af552add042d716f1d168')).toBeUndefined();
    expect(verifiedCoingeckoId('robinhood', '')).toBeUndefined();
  });
});
