import { z } from 'zod';
import { Network, TriggerDirection } from '@prisma/client';

// ─────────────────────────────────────────
// Авторизація
// ─────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Невірний формат email').toLowerCase(),
  password: z
    .string()
    .min(8, 'Пароль має містити щонайменше 8 символів')
    .max(100, 'Пароль занадто довгий'),
  name: z.string().min(1).max(100).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Пароль обовʼязковий'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

// ─────────────────────────────────────────
// Адреси гаманців
// ─────────────────────────────────────────

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidEvmAddress(address: string): boolean {
  return EVM_ADDRESS.test(address);
}

export function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS.test(address);
}

export function isValidAddressForNetwork(address: string, network: Network): boolean {
  if (network === Network.SOLANA) return isValidSolanaAddress(address);
  return isValidEvmAddress(address); // EVM — одна адреса для всіх 8 мереж
}

export const walletCreateSchema = z
  .object({
    address: z.string().min(1, 'Адреса обовʼязкова').max(100),
    network: z.nativeEnum(Network),
    label: z.string().max(50).optional().nullable(),
  })
  .refine((data) => isValidAddressForNetwork(data.address, data.network), {
    message:
      'Невірний формат адреси. EVM: 0x... (42 символи). Solana: Base58 (32–44 символи)',
    path: ['address'],
  });

export type WalletCreateInput = z.infer<typeof walletCreateSchema>;

// ─────────────────────────────────────────
// Тригери
// ─────────────────────────────────────────

const triggerBase = z.object({
  tokenId: z.string().min(1),
  tokenSymbol: z.string().min(1),
  tokenName: z.string().min(1),
  isActive: z.boolean().default(true),
});

const percentTriggerSchema = triggerBase.extend({
  triggerType: z.literal('PERCENT'),
  threshold: z.number().int().min(1).max(100),
  direction: z.nativeEnum(TriggerDirection).default('BOTH'),
  // Мінімум 15 хв — збігається з частотою cron на проді.
  interval: z.number().int().min(15).max(1440),
});

const priceTargetTriggerSchema = triggerBase.extend({
  triggerType: z.literal('PRICE_TARGET'),
  targetPrice: z.number().positive(),
  direction: z.enum(['UP', 'DOWN']),
});

export const triggerCreateSchema = z.discriminatedUnion('triggerType', [
  percentTriggerSchema,
  priceTargetTriggerSchema,
]);

export type TriggerCreateInput = z.infer<typeof triggerCreateSchema>;

export const triggerUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  threshold: z.number().int().min(1).max(100).optional(),
  direction: z.nativeEnum(TriggerDirection).optional(),
  interval: z.number().int().min(15).max(1440).optional(),
  targetPrice: z.number().positive().optional(),
});
export type TriggerUpdateInput = z.infer<typeof triggerUpdateSchema>;

// ─────────────────────────────────────────
// Профіль
// ─────────────────────────────────────────

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional().nullable(),
  telegramChatId: z
    .string()
    .regex(/^-?\d+$/, 'Telegram Chat ID має бути числом')
    .optional()
    .nullable()
    .or(z.literal('')),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ─────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ─────────────────────────────────────────
// Market
// ─────────────────────────────────────────

export const historyDaysSchema = z.coerce
  .number()
  .int()
  .refine((v) => [1, 7, 30, 90, 365].includes(v), {
    message: 'days має бути одним з 1, 7, 30, 90, 365',
  })
  .default(7);
