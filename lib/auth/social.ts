import { prisma } from "@/lib/db/prisma";

/** Resolve by provider identity only; never merge accounts by an unproven email. */
export async function resolveSocialUser(
  provider: string,
  subject: string,
  email: string | null,
  name: string | null,
) {
  const identity = { provider, providerAccountId: subject };
  const existing = await prisma.account.findUnique({
    where: { provider_providerAccountId: identity },
    include: { user: true },
  });
  if (existing) return existing.user.isBlocked ? null : existing.user;
  const address =
    provider === "telegram" ? `telegram-${subject}@telegram.invalid` : email;
  if (!address || (await prisma.user.findUnique({ where: { email: address } })))
    return null;
  // Nested creation is atomic: an identity cannot be left without its user.
  return prisma.user.create({
    data: {
      email: address,
      name,
      emailVerified: provider === "google" ? new Date() : null,
      accounts: { create: { ...identity, type: "oidc" } },
    },
  });
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
