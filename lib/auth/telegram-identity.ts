import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export class TelegramIdentityConflict extends Error {
  constructor(
    public code:
      | 'TelegramAlreadyLinked'
      | 'TelegramLinkRequired'
      | 'TelegramInvalidIdentity'
      | 'TelegramLinkExpired',
  ) {
    super(code);
  }
}

export async function resolveTelegramIdentity(
  subject: string,
  name: string | null,
  telegramId?: string,
  linkUserId?: string,
  botAccess = false,
) {
  if (!telegramId || !/^[1-9]\d{0,15}$/.test(telegramId))
    throw new TelegramIdentityConflict('TelegramInvalidIdentity');
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
          if (existing.user.isBlocked) return null;
          if (
            existing.user.telegramUserId &&
            existing.user.telegramUserId !== telegramId
          )
            throw new TelegramIdentityConflict('TelegramInvalidIdentity');
          const recipientOwner = await tx.user.findFirst({
            where: { telegramChatId: telegramId, id: { not: existing.userId } },
          });
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              telegramUserId: telegramId,
              ...(botAccess ? { telegramBotAccess: true } : {}),
              // Reauthentication never overwrites a legacy recipient or opts a
              // user back into notifications they have explicitly disabled.
              ...(!recipientOwner &&
              !existing.user.telegramChatId &&
              botAccess &&
              existing.user.telegramNotificationsEnabled
                ? { telegramChatId: telegramId }
                : {}),
            },
          });
          return existing.user;
        }
        if (linkUserId) {
          const user = await tx.user.findUnique({ where: { id: linkUserId } });
          if (!user || user.isBlocked) return null;
          const other = await tx.account.findFirst({
            where: { userId: linkUserId, provider: 'telegram' },
          });
          if (other)
            throw new TelegramIdentityConflict('TelegramAlreadyLinked');
          const owner = await tx.user.findFirst({
            where: { telegramUserId: telegramId, id: { not: linkUserId } },
          });
          if (owner)
            throw new TelegramIdentityConflict('TelegramAlreadyLinked');
          const recipientOwner = await tx.user.findFirst({
            where: { telegramChatId: telegramId, id: { not: linkUserId } },
          });
          await tx.account.create({
            data: { ...identity, type: 'oidc', userId: linkUserId },
          });
          await tx.user.update({
            where: { id: linkUserId },
            data: {
              telegramUserId: telegramId,
              telegramBotAccess: botAccess,
              ...(!recipientOwner &&
              !user.telegramChatId &&
              botAccess &&
              user.telegramNotificationsEnabled
                ? { telegramChatId: telegramId }
                : {}),
            },
          });
          return user;
        }
        // Legacy chat IDs were entered manually. They suggest a duplicate but do
        // NOT prove ownership: require password login and explicit OAuth linking.
        if (
          telegramId &&
          (await tx.user.findFirst({
            where: {
              OR: [
                { telegramChatId: telegramId },
                { telegramUserId: telegramId },
              ],
            },
          }))
        ) {
          throw new TelegramIdentityConflict('TelegramLinkRequired');
        }
        return tx.user.create({
          data: {
            email: `telegram-${subject}@telegram.invalid`,
            name,
            telegramUserId: telegramId,
            telegramBotAccess: botAccess,
            telegramChatId: botAccess ? telegramId : null,
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
