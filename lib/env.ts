import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обовʼязковий'),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  MORALIS_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  COINGECKO_BASE_URL: z.string().url().default('https://api.coingecko.com/api/v3'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  CRON_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

let cached: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] Невірна конфігурація:', parsed.error.flatten().fieldErrors);
    throw new Error('Невірні змінні середовища');
  }
  if (!parsed.data.AUTH_SECRET && !parsed.data.NEXTAUTH_SECRET) {
    console.warn('[env] AUTH_SECRET/NEXTAUTH_SECRET не встановлено — потрібно для production');
  }
  cached = parsed.data;
  return cached;
}

export type Env = ReturnType<typeof getEnv>;
