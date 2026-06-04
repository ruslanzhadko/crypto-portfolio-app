import { describe, it, expect } from 'vitest';
import { Network } from '@prisma/client';
import {
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidAddressForNetwork,
  walletCreateSchema,
  triggerCreateSchema,
  profileUpdateSchema,
  historyDaysSchema,
} from '@/lib/utils/validators';

const EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

describe('isValidEvmAddress', () => {
  it('валідна 0x + 40 hex → true', () => {
    expect(isValidEvmAddress(EVM)).toBe(true);
  });
  it('mixed-case hex → true', () => {
    expect(isValidEvmAddress('0xABCDEF0123456789abcdef0123456789ABCDEF01')).toBe(true);
  });
  it('закоротка → false', () => {
    expect(isValidEvmAddress('0x123')).toBe(false);
  });
  it('без префікса 0x → false', () => {
    expect(isValidEvmAddress('d8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(false);
  });
  it('не-hex символи → false', () => {
    expect(isValidEvmAddress('0xZZZZ6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(false);
  });
  it('порожній рядок → false', () => {
    expect(isValidEvmAddress('')).toBe(false);
  });
});

describe('isValidSolanaAddress', () => {
  it('валідна base58 → true', () => {
    expect(isValidSolanaAddress(SOL)).toBe(true);
  });
  it('закоротка (<32) → false', () => {
    expect(isValidSolanaAddress('abc')).toBe(false);
  });
  it('містить заборонені символи (0, O, I, l) → false', () => {
    expect(isValidSolanaAddress('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl')).toBe(false);
  });
  it('EVM-адреса не є валідною Solana → false', () => {
    expect(isValidSolanaAddress(EVM)).toBe(false);
  });
});

describe('isValidAddressForNetwork', () => {
  it('EVM мережа + EVM адреса → true', () => {
    expect(isValidAddressForNetwork(EVM, Network.EVM)).toBe(true);
  });
  it('EVM мережа + Solana адреса → false', () => {
    expect(isValidAddressForNetwork(SOL, Network.EVM)).toBe(false);
  });
  it('SOLANA мережа + Solana адреса → true', () => {
    expect(isValidAddressForNetwork(SOL, Network.SOLANA)).toBe(true);
  });
  it('SOLANA мережа + EVM адреса → false', () => {
    expect(isValidAddressForNetwork(EVM, Network.SOLANA)).toBe(false);
  });
});

describe('walletCreateSchema (.refine викликає валідатор адреси)', () => {
  it('валідний EVM-гаманець → success', () => {
    const r = walletCreateSchema.safeParse({ address: EVM, network: Network.EVM, label: 'Main' });
    expect(r.success).toBe(true);
  });
  it('невірна адреса для мережі → fail', () => {
    const r = walletCreateSchema.safeParse({ address: 'oops', network: Network.EVM });
    expect(r.success).toBe(false);
  });
});

describe('triggerCreateSchema (discriminatedUnion)', () => {
  it('валідний PERCENT тригер → success', () => {
    const r = triggerCreateSchema.safeParse({
      triggerType: 'PERCENT',
      tokenId: 'bitcoin',
      tokenSymbol: 'BTC',
      tokenName: 'Bitcoin',
      threshold: 5,
      interval: 60,
    });
    expect(r.success).toBe(true);
  });
  it('валідний PRICE_TARGET тригер → success', () => {
    const r = triggerCreateSchema.safeParse({
      triggerType: 'PRICE_TARGET',
      tokenId: 'bitcoin',
      tokenSymbol: 'BTC',
      tokenName: 'Bitcoin',
      targetPrice: 100000,
      direction: 'UP',
    });
    expect(r.success).toBe(true);
  });
  it('PERCENT поза діапазоном threshold → fail', () => {
    const r = triggerCreateSchema.safeParse({
      triggerType: 'PERCENT',
      tokenId: 'x',
      tokenSymbol: 'X',
      tokenName: 'X',
      threshold: 0, // min 1
      interval: 60,
    });
    expect(r.success).toBe(false);
  });
});

describe('profileUpdateSchema (regex telegramChatId)', () => {
  it('числовий chatId → success', () => {
    expect(profileUpdateSchema.safeParse({ telegramChatId: '123456' }).success).toBe(true);
  });
  it('порожній рядок дозволено → success', () => {
    expect(profileUpdateSchema.safeParse({ telegramChatId: '' }).success).toBe(true);
  });
  it('нечисловий chatId → fail', () => {
    expect(profileUpdateSchema.safeParse({ telegramChatId: 'abc' }).success).toBe(false);
  });
});

describe('historyDaysSchema (.refine білий список)', () => {
  it.each([1, 7, 30, 90, 365])('дозволене значення %i → success', (v) => {
    expect(historyDaysSchema.safeParse(v).success).toBe(true);
  });
  it('значення поза списком → fail', () => {
    expect(historyDaysSchema.safeParse(5).success).toBe(false);
  });
});
