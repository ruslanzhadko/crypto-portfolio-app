import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
import { prisma } from '@/lib/db/prisma';
import { resolveSocialUser } from './social';
import { safeCallbackUrl } from './redirect';
import { registerSchema } from '@/lib/utils/validators';

beforeEach(() => {
  vi.resetAllMocks();
});
describe('social identities', () => {
  it('uses the linked identity, even when the provider email changes', async () => {
    const user = { id: 'existing', isBlocked: false };
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ user } as never);
    expect(
      await resolveSocialUser('google', '123', 'new@example.com', null),
    ).toEqual(user);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('denies blocked users', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      user: { isBlocked: true },
    } as never);
    expect(
      await resolveSocialUser('google', '123', 'x@example.com', null),
    ).toBeNull();
  });
  it('does not merge an existing email account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'password-account',
    } as never);
    expect(
      await resolveSocialUser('google', '123', 'x@example.com', null),
    ).toBeNull();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('creates a Google identity atomically with its verified email', async () => {
    await resolveSocialUser('google', '123', 'verified@example.com', 'Name');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'verified@example.com',
        name: 'Name',
        emailVerified: expect.any(Date),
        accounts: {
          create: {
            provider: 'google',
            providerAccountId: '123',
            type: 'oidc',
          },
        },
      },
    });
  });
  it('reserves internal Telegram addresses from password registration', () => {
    expect(
      registerSchema.safeParse({
        email: 'telegram-123@telegram.invalid',
        password: 'password123',
      }).success,
    ).toBe(false);
  });
});
describe('return destinations', () => {
  it.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    '/\nevil.example',
    null,
  ])('rejects unsafe destination %s', (value) => {
    expect(safeCallbackUrl(value, 'ru')).toBe('/ru/dashboard');
  });
  it('preserves local destinations', () => {
    expect(safeCallbackUrl('/uk/wallets?view=all', 'uk')).toBe(
      '/uk/wallets?view=all',
    );
  });
});
