import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decode } from 'next-auth/jwt';
vi.mock('@/lib/api/auth-guard', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth/social', () => ({
  socialAvailability: () => ({ telegram: true }),
}));
vi.mock('@/lib/auth/telegram-link', () => ({
  TELEGRAM_LINK_COOKIE: 'telegram-link-intent',
}));
import { requireUser } from '@/lib/api/auth-guard';
import { POST } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_SECRET', 'test-only-secret');
  vi.mocked(requireUser).mockResolvedValue({
    ok: true,
    user: {
      id: 'main',
      email: 'main@example.com',
      role: 'USER',
      isBlocked: false,
    },
  });
});
afterEach(() => vi.unstubAllEnvs());
it('rejects cross-origin linking before reading the session', async () => {
  const res = await POST(
    new NextRequest('https://app.example/api/user/telegram-link', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    }),
  );
  expect(res.status).toBe(403);
  expect(requireUser).not.toHaveBeenCalled();
});
it('requires authentication', async () => {
  vi.mocked(requireUser).mockResolvedValue({
    ok: false,
    response: new (await import('next/server')).NextResponse(null, {
      status: 401,
    }),
  });
  const res = await POST(
    new NextRequest('https://app.example/api/user/telegram-link', {
      method: 'POST',
      headers: { origin: 'https://app.example' },
    }),
  );
  expect(res.status).toBe(401);
  expect(res.headers.has('set-cookie')).toBe(false);
});
it('sets an encrypted, short-lived intent for the authenticated user', async () => {
  const res = await POST(
    new NextRequest('https://app.example/api/user/telegram-link', {
      method: 'POST',
      headers: { origin: 'https://app.example' },
    }),
  );
  expect(res.status).toBe(200);
  const cookie = res.cookies.get('telegram-link-intent');
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
  });
  expect(
    await decode({
      token: cookie!.value,
      secret: 'test-only-secret',
      salt: 'telegram-link-intent',
    }),
  ).toMatchObject({ userId: 'main' });
});
