import { describe, expect, it, vi } from 'vitest';
import { falsePriceJumps } from './price-jump';

const gate = (prices: Record<string, number>) => vi.fn(async () => new Map(Object.entries(prices)));
const cate = { symbol: 'CATE', previous: 0.041, next: 204.47 };

describe('falsePriceJumps', () => {
  it('drops a jump when Gate still shows the old price', async () => {
    expect(await falsePriceJumps([cate], gate({ CATEUSDT: 0.04 }))).toEqual(new Set([cate]));
  });

  it('drops a false crash as well', async () => {
    const crash = { symbol: 'MET', previous: 0.28, next: 0.0001 };
    expect((await falsePriceJumps([crash], gate({ METUSDT: 0.28 }))).size).toBe(1);
  });

  it('keeps a real move that Gate confirms, which also repairs a stuck bad price', async () => {
    const repair = { symbol: 'CATE', previous: 204.47, next: 0.041 };
    expect((await falsePriceJumps([repair], gate({ CATEUSDT: 0.04 }))).size).toBe(0);
  });

  it('keeps the move when the ticker is another coin with the same symbol', async () => {
    expect((await falsePriceJumps([cate], gate({ CATEUSDT: 7 }))).size).toBe(0);
  });

  it('keeps the move when Gate has no such coin or is down', async () => {
    expect((await falsePriceJumps([cate], gate({}))).size).toBe(0);
    expect((await falsePriceJumps([cate], vi.fn().mockRejectedValue(new Error('down')))).size).toBe(0);
  });

  it('does not ask Gate about ordinary moves, first prices or odd symbols', async () => {
    const tickers = gate({});
    await falsePriceJumps(
      [
        { symbol: 'ETH', previous: 2000, next: 2500 },
        { symbol: 'NEW', previous: 0, next: 5 },
        { symbol: '$W/IF', previous: 1, next: 50 },
      ],
      tickers,
    );
    expect(tickers).not.toHaveBeenCalled();
  });
});
