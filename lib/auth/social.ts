import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { resolveTelegramIdentity } from './telegram-identity';

/** Resolve by provider identity only; never merge accounts by an unproven email. */
export async function resolveSocialUser(
  provider: string,
  subject: string,
  email: string | null,
  name: string | null,
) {
  if (provider === 'telegram') return resolveTelegramIdentity(subject, name);
  const identity = { provider, providerAccountId: subject };
  const existing = await prisma.account.findUnique({
    where: { provider_providerAccountId: identity },
    include: { user: true },
  });
  if (existing) return existing.user.isBlocked ? null : existing.user;
  const address = email;
  if (!address || (await prisma.user.findUnique({ where: { email: address } })))
    return null;
  // Nested creation is atomic: an identity cannot be left without its user.
  try {
    return await prisma.user.create({
      data: {
        email: address,
        name,
        emailVerified: provider === 'google' ? new Date() : null,
        accounts: { create: { ...identity, type: 'oidc' } },
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      throw error;
    // A concurrent callback may have completed the same identity. Only reuse
    // that identity; never attach to an account based on matching email alone.
    const concurrent = await prisma.account.findUnique({
      where: { provider_providerAccountId: identity },
      include: { user: true },
    });
    return concurrent && !concurrent.user.isBlocked ? concurrent.user : null;
  }
}

export function telegramBotReady() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.AUTH_TELEGRAM_ID &&
    process.env.TELEGRAM_BOT_TOKEN.split(':')[0] ===
      process.env.AUTH_TELEGRAM_ID,
  );
}

export function socialAvailability() {
  return {
    google: Boolean(
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
    ),
    telegram: Boolean(
      process.env.AUTH_TELEGRAM_ID && process.env.AUTH_TELEGRAM_SECRET,
    ),
  };
}
