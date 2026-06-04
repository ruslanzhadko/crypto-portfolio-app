import { describe, it, expect } from 'vitest';
import { classifyTokenTransfers } from '@/lib/services/ankr';

// classifyTokenTransfers — чиста класифікація ERC-20 переказів за net-change:
// групує по transactionHash, визначає send / receive / swap відносно гаманця,
// фільтрує спам (non-ASCII, URL-патерни) і пил (< MIN_TOKEN_TX = 0.001).

const WALLET = '0xwallet';

// Фабрика сирого Ankr token-transfer запису. blockchain 'eth' → chainName 'ethereum'.
function transfer(over: Record<string, unknown> = {}) {
  return {
    blockchain: 'eth',
    transactionHash: '0xhash1',
    fromAddress: '0xsender',
    toAddress: WALLET,
    value: '5',
    tokenDecimals: 0,
    tokenName: 'USD Coin',
    tokenSymbol: 'USDC',
    blockHeight: 100,
    blockTimestamp: 1_700_000_000,
    ...over,
  };
}

// Хелпер: classifyTokenTransfers приймає внутрішній тип AnkrTokenTransfer[]
function classify(transfers: ReturnType<typeof transfer>[]) {
  return classifyTokenTransfers(WALLET, transfers as Parameters<typeof classifyTokenTransfers>[1]);
}

describe('classifyTokenTransfers (net-change)', () => {
  it('отримання — лише вхідний переказ (+) → type=receive', () => {
    const r = classify([transfer({ fromAddress: '0xsender', toAddress: WALLET, value: '5' })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('receive');
    expect(r[0]!.value).toBe(5);
    expect(r[0]!.tokenSymbol).toBe('USDC');
    expect(r[0]!.fromAddress).toBe('0xsender');
    expect(r[0]!.toAddress).toBe(WALLET);
  });

  it('відправлення — лише вихідний переказ (−) → type=send', () => {
    const r = classify([
      transfer({ fromAddress: WALLET, toAddress: '0xrecipient', value: '3', tokenSymbol: 'DAI' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('send');
    expect(r[0]!.value).toBe(3);
    expect(r[0]!.fromAddress).toBe(WALLET);
    expect(r[0]!.toAddress).toBe('0xrecipient');
  });

  it('своп — вихідний + вхідний у тому ж хеші (+/−) → type=swap', () => {
    const r = classify([
      transfer({ transactionHash: '0xswap', fromAddress: WALLET, toAddress: '0xpool', value: '1', tokenSymbol: 'ETH' }),
      transfer({ transactionHash: '0xswap', fromAddress: '0xpool', toAddress: WALLET, value: '1500', tokenSymbol: 'USDC' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.type).toBe('swap');
    expect(r[0]!.tokenSymbol).toBe('ETH → USDC');
    expect(r[0]!.value).toBe(1500); // отримано
    expect(r[0]!.sentValue).toBe(1); // продано
  });

  it('поріг THRESHOLD рівно на межі: value === 0.001 → включається', () => {
    // 0.001 токена з 18 decimals = 1e15 raw
    const r = classify([transfer({ value: '1000000000000000', tokenDecimals: 18, tokenSymbol: 'TKN' })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.value).toBeCloseTo(0.001);
  });

  it('пил нижче порога: value < 0.001 → відфільтровано', () => {
    // 0.0009 токена з 18 decimals = 9e14 raw
    const r = classify([transfer({ value: '900000000000000', tokenDecimals: 18, tokenSymbol: 'TKN' })]);
    expect(r).toHaveLength(0);
  });

  it('спам-фільтр: non-ASCII символ → відфільтровано', () => {
    const r = classify([transfer({ tokenSymbol: 'Золото', value: '100' })]);
    expect(r).toHaveLength(0);
  });

  it('спам-фільтр: URL/keyword у назві (.io / claim) → відфільтровано', () => {
    const r = classify([transfer({ tokenSymbol: 'USDC', tokenName: 'claim at airdrop.io', value: '100' })]);
    expect(r).toHaveLength(0);
  });

  it('нульове значення (value="0") → відфільтровано', () => {
    const r = classify([transfer({ value: '0' })]);
    expect(r).toHaveLength(0);
  });

  it('невідомий блокчейн → пропускається', () => {
    const r = classify([transfer({ blockchain: 'fantom' })]);
    expect(r).toHaveLength(0);
  });

  it('порожній масив → порожній результат', () => {
    expect(classify([])).toHaveLength(0);
  });

  it('кілька різних транзакцій → кілька результатів', () => {
    const r = classify([
      transfer({ transactionHash: '0xA', toAddress: WALLET, value: '10' }),
      transfer({ transactionHash: '0xB', fromAddress: WALLET, toAddress: '0xx', value: '20' }),
    ]);
    expect(r).toHaveLength(2);
    const byType = r.map((t) => t.type).sort((a, b) => a.localeCompare(b));
    expect(byType).toEqual(['receive', 'send']);
  });
});
