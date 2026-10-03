import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { encode } from 'next-auth/jwt';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
    has: (name: string) => jar.has(name),
  }),
  headers: () =>
    new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }),
}));
import { telegramLinkTarget, TELEGRAM_LINK_COOKIE } from './telegram-link';
const secret = 'test-only-linking-secret';
beforeEach(() => {
  jar.clear();
  vi.stubEnv('AUTH_SECRET', secret);
});
afterEach(() => vi.unstubAllEnvs());
async function intent(id: string, maxAge = 600) {
  jar.set(
    TELEGRAM_LINK_COOKIE,
    await encode({
      secret,
      salt: TELEGRAM_LINK_COOKIE,
      maxAge,
      token: { userId: id },
    }),
  );
}
async function session(id: string) {
  const name = '__Secure-authjs.session-token';
  jar.set(name, await encode({ secret, salt: name, token: { id } }));
}
it('does not link during ordinary sign-in', async () => {
  expect(await telegramLinkTarget()).toBeUndefined();
});
it('requires both explicit intent and the matching session', async () => {
  await intent('main');
  await session('main');
  expect(await telegramLinkTarget()).toBe('main');
});
it('rejects a different current user', async () => {
  await intent('main');
  await session('other');
  await expect(telegramLinkTarget()).rejects.toThrow();
});
it('rejects an absent session', async () => {
  await intent('main');
  await expect(telegramLinkTarget()).rejects.toThrow();
});
it('rejects expired intent', async () => {
  await intent('main', -3600);
  await session('main');
  await expect(telegramLinkTarget()).rejects.toThrow();
});
