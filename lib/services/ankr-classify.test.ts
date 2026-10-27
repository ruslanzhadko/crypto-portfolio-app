import { describe, it, expect } from 'vitest';
import { attachNativeLegs, classifyTokenTransfers } from '@/lib/services/ankr';

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
    const r = classify([transfer({ value: '0.001', valueRawInteger: '1000000000000000', tokenDecimals: 18, tokenSymbol: 'TKN' })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.value).toBeCloseTo(0.001);
  });

  it('пил нижче порога: value < 0.001 → відфільтровано', () => {
    // 0.0009 токена з 18 decimals = 9e14 raw
    const r = classify([transfer({ value: '0.0009', valueRawInteger: '900000000000000', tokenDecimals: 18, tokenSymbol: 'TKN' })]);
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

  it('keeps the real BSC 100 USDT send with Ankr human and raw amounts', () => {
    const r = classify([transfer({
      blockchain: 'bsc', fromAddress: WALLET, toAddress: '0xrecipient',
      transactionHash: '0x46c56afb5fbd56cb9b2c445fbcee7beb687e4614e987107b6cae9aca2c8dfbd6',
      tokenSymbol: 'USDT', tokenName: 'Tether USD', tokenDecimals: 18,
      value: '100', valueRawInteger: '100000000000000000000',
    })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'send', chainName: 'bsc', value: 100 });
  });

  it('does not scale integer human amounts when raw amounts are absent', () => {
    const r = classify([transfer({ value: '100', tokenDecimals: 18 })]);
    expect(r[0]?.value).toBe(100);
  });

  it('uses explicit raw units without losing the fractional remainder', () => {
    const r = classify([transfer({ value: '1.234567', valueRawInteger: '1234567', tokenDecimals: 6 })]);
    expect(r[0]?.value).toBeCloseTo(1.234567);
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

describe('DEX trades paid or settled in the native coin', () => {
  it('sums every part of one token delivered in several transfers', () => {
    const r = classify([
      transfer({ transactionHash: '0xbuy', fromAddress: '0x0', value: '100', tokenSymbol: 'ZC', contractAddress: '0xzc' }),
      transfer({ transactionHash: '0xbuy', fromAddress: '0x0', value: '50', tokenSymbol: 'ZC', contractAddress: '0xzc' }),
    ]);
    expect(r[0]).toMatchObject({ type: 'receive', value: 150 });
  });

  it('turns a token bought with ETH (the call value) into an ETH → token swap', () => {
    const [buy] = classify([transfer({ transactionHash: '0xBuy', fromAddress: '0x0', value: '120', tokenSymbol: 'ZC', contractAddress: '0xzc' })]);
    const [r] = attachNativeLegs([buy!], [{ hash: '0xbuy', chainName: 'ethereum', value: 0.021 }], new Map());
    expect(r).toMatchObject({ type: 'swap', tokenSymbol: 'ETH → ZC', sentValue: 0.021, value: 120, swapInTokenAddress: '0xzc', logoUrl: null });
  });

  it('turns a token sold for internal ETH into a token → ETH swap', () => {
    const [sell] = classify([transfer({ transactionHash: '0xsell', fromAddress: WALLET, toAddress: '0xrouter', value: '300', tokenSymbol: 'ZC', contractAddress: '0xzc' })]);
    const [r] = attachNativeLegs([sell!], [{ hash: '0xsell', chainName: 'ethereum', value: 0 }], new Map([['0xsell', 0.1]]));
    expect(r).toMatchObject({ type: 'swap', tokenSymbol: 'ZC → ETH', sentValue: 300, value: 0.1, swapOutTokenAddress: '0xzc' });
  });

  it('turns an older or relayed sale into a swap without a call by the wallet', () => {
    const [sell] = classify([transfer({ transactionHash: '0xold', fromAddress: WALLET, toAddress: '0xsettlement', value: '320273', tokenSymbol: 'ZC', contractAddress: '0xzc' })]);
    const [r] = attachNativeLegs([sell!], [], new Map([['0xold', 0.4]]));
    expect(r).toMatchObject({ type: 'swap', tokenSymbol: 'ZC → ETH', sentValue: 320273, value: 0.4 });
  });

  it('does not treat a received token as a buy without a call by the wallet', () => {
    const [received] = classify([transfer({ transactionHash: '0xgift', fromAddress: '0x0', value: '10', tokenSymbol: 'ZC' })]);
    expect(attachNativeLegs([received!], [], new Map())[0]).toMatchObject({ type: 'receive' });
  });

  it('leaves plain transfers and calls without a native leg alone', () => {
    const txs = classify([
      transfer({ transactionHash: '0xin', value: '5' }),
      transfer({ transactionHash: '0xout', fromAddress: WALLET, toAddress: '0xfriend', value: '3' }),
    ]);
    const r = attachNativeLegs(txs, [{ hash: '0xout', chainName: 'ethereum', value: 0 }], new Map());
    expect(r.map((t) => t.type).sort((a, b) => a.localeCompare(b))).toEqual(['receive', 'send']);
  });
});
