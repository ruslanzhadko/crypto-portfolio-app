import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (value: typeof db) => unknown) => fn(db),
  },
}));
vi.mock('@/lib/api/auth-guard', () => ({
  requireUser: async () => ({ ok: true, user: { id: 'main' } }),
}));
import { GET, PUT } from './route';
beforeEach(() => vi.resetAllMocks());
it('does not expose a synthetic email through the profile API', async () => {
  db.user.findUnique.mockResolvedValue({
    id: 'main',
    email: 'telegram-sub@telegram.invalid',
  });
  expect((await (await GET()).json()).user.email).toBeNull();
});
it('rejects manual notification recipient assignment', async () => {
  db.user.findFirst.mockResolvedValue({ id: 'other' });
  const res = await PUT(
    new NextRequest('https://app.example/api/user/profile', {
      method: 'PUT',
      headers: { origin: 'https://app.example' },
      body: JSON.stringify({ telegramChatId: '1234' }),
    }),
  );
  expect(res.status).toBe(400);
  expect(db.user.update).not.toHaveBeenCalled();
});
it('allows name changes without touching the notification or login identity', async () => {
  db.user.update.mockResolvedValue({
    id: 'main',
    email: 'main@example.com',
    telegramChatId: null,
  });
  const res = await PUT(
    new NextRequest('https://app.example/api/user/profile', {
      method: 'PUT',
      headers: { origin: 'https://app.example' },
      body: JSON.stringify({ name: 'Updated' }),
    }),
  );
  expect(res.status).toBe(200);
  expect(db.user.findFirst).not.toHaveBeenCalled();
});
