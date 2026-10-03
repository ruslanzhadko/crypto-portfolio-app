import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export class TelegramIdentityConflict extends Error {
  constructor(public code: 'TelegramAlreadyLinked' | 'TelegramLinkRequired') {
    super(code);
  }
}

export async function resolveTelegramIdentity(
  subject: string,
  name: string | null,
  telegramId?: string,
  linkUserId?: string,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const identity = { provider: 'telegram', providerAccountId: subject };
        const existing = await tx.account.findUnique({
          where: { provider_providerAccountId: identity },
          include: { user: true },
        });
        if (existing) {
          if (linkUserId && existing.userId !== linkUserId)
            throw new TelegramIdentityConflict('TelegramAlreadyLinked');
          return existing.user.isBlocked ? null : existing.user;
        }
        if (linkUserId) {
          const user = await tx.user.findUnique({ where: { id: linkUserId } });
          if (!user || user.isBlocked) return null;
          const other = await tx.account.findFirst({
            where: { userId: linkUserId, provider: 'telegram' },
          });
          if (other)
            throw new TelegramIdentityConflict('TelegramAlreadyLinked');
          await tx.account.create({
            data: { ...identity, type: 'oidc', userId: linkUserId },
          });
          return user;
        }
        // Legacy chat IDs were entered manually. They suggest a duplicate but do
        // NOT prove ownership: require password login and explicit OAuth linking.
        if (
          telegramId &&
          (await tx.user.findFirst({ where: { telegramChatId: telegramId } }))
        ) {
          throw new TelegramIdentityConflict('TelegramLinkRequired');
        }
        return tx.user.create({
          data: {
            email: `telegram-${subject}@telegram.invalid`,
            name,
            accounts: { create: { ...identity, type: 'oidc' } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    ) {
      // Concurrent linking/registration must never move an existing identity.
      throw new TelegramIdentityConflict('TelegramAlreadyLinked');
    }
    throw error;
  }
}
