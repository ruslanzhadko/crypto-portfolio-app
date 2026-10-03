import { beforeEach, describe, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  account: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) },
}));
import { resolveTelegramIdentity } from './telegram-identity';
import { publicEmail } from './public-email';
beforeEach(() => vi.resetAllMocks());

describe('Telegram identity ownership', () => {
  it('requires explicit linking when notifications already use this Telegram', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'main' });
    await expect(
      resolveTelegramIdentity('oidc-sub', 'Name', '1234'),
    ).rejects.toMatchObject({ code: 'TelegramLinkRequired' });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.account.create).not.toHaveBeenCalled();
  });
  it('links to the authenticated account without replacing email, role or portfolio', async () => {
    const user = {
      id: 'main',
      email: 'main@example.com',
      role: 'ADMIN',
      isBlocked: false,
    };
    tx.user.findUnique.mockResolvedValue(user);
    expect(
      await resolveTelegramIdentity(
        'oidc-sub',
        'Telegram name',
        '1234',
        'main',
      ),
    ).toEqual(user);
    expect(tx.account.create).toHaveBeenCalledWith({
      data: {
        provider: 'telegram',
        providerAccountId: 'oidc-sub',
        type: 'oidc',
        userId: 'main',
      },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('never transfers another user’s identity', async () => {
    tx.account.findUnique.mockResolvedValue({
      userId: 'other',
      user: { id: 'other' },
    });
    await expect(
      resolveTelegramIdentity('sub', null, '1234', 'main'),
    ).rejects.toMatchObject({ code: 'TelegramAlreadyLinked' });
    expect(tx.account.create).not.toHaveBeenCalled();
  });
  it('rejects replacing an already linked Telegram', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'main', isBlocked: false });
    tx.account.findFirst.mockResolvedValue({
      providerAccountId: 'another-sub',
    });
    await expect(
      resolveTelegramIdentity('sub', null, '1234', 'main'),
    ).rejects.toMatchObject({ code: 'TelegramAlreadyLinked' });
  });
  it('signs in to the linked main account', async () => {
    tx.account.findUnique.mockResolvedValue({
      userId: 'main',
      user: { id: 'main', isBlocked: false },
    });
    expect(await resolveTelegramIdentity('sub', null, '1234')).toMatchObject({
      id: 'main',
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it.each([null, { id: 'main', isBlocked: true }])(
    'cannot link deleted or blocked target %s',
    async (user) => {
      tx.user.findUnique.mockResolvedValue(user);
      expect(
        await resolveTelegramIdentity('sub', null, '1234', 'main'),
      ).toBeNull();
      expect(tx.account.create).not.toHaveBeenCalled();
    },
  );
  it('creates a separate Telegram-only account only when there is no existing link or notification profile', async () => {
    await resolveTelegramIdentity('sub', 'Name', '1234');
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'telegram-sub@telegram.invalid',
        name: 'Name',
        accounts: {
          create: {
            provider: 'telegram',
            providerAccountId: 'sub',
            type: 'oidc',
          },
        },
      },
    });
  });
  it('hides internal addresses but preserves real email', () => {
    expect(publicEmail('telegram-sub@telegram.invalid')).toBeNull();
    expect(publicEmail('person@example.com')).toBe('person@example.com');
  });
});
