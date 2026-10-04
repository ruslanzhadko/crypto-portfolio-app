import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() } }));
const guard = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (value: typeof db) => unknown) => fn(db) } }));
vi.mock('@/lib/api/auth-guard', () => ({ requireUser: guard }));
vi.mock('@/lib/auth/social', () => ({ telegramBotReady: () => true }));
import { PUT } from './route';
function request(body: unknown, origin = 'https://app.example') {
  return new NextRequest('https://app.example/api/user/telegram-notifications', { method: 'PUT', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  guard.mockResolvedValue({ ok: true, user: { id: 'main' } });
  db.user.findUnique.mockResolvedValue({ id: 'main', telegramUserId: '1234', telegramBotAccess: true, telegramChatId: '999', isBlocked: false });
});
it('preserves login and destination when notifications are disabled', async () => {
  expect((await PUT(request({ enabled: false }))).status).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'main' }, data: { telegramNotificationsEnabled: false } });
});
it('preserves the legacy recipient unless switching is explicitly requested', async () => {
  await PUT(request({ enabled: true }));
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'main' }, data: { telegramChatId: '999', telegramNotificationsEnabled: true } });
});
it('switches only to the server-verified Telegram recipient', async () => {
  expect((await PUT(request({ enabled: true, useLinked: true }))).status).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'main' }, data: { telegramChatId: '1234', telegramNotificationsEnabled: true } });
});
it('requires permission to enable a newly linked bot recipient', async () => {
  db.user.findUnique.mockResolvedValue({ id: 'main', telegramUserId: '1234', telegramBotAccess: false });
  expect((await PUT(request({ enabled: true }))).status).toBe(400);
  expect(db.user.update).not.toHaveBeenCalled();
});
it('does not take a recipient assigned to another profile', async () => {
  db.user.findFirst.mockResolvedValue({ id: 'other' });
  expect((await PUT(request({ enabled: true, useLinked: true }))).status).toBe(409);
  expect(db.user.update).not.toHaveBeenCalled();
});
it('rejects cross-origin requests before database access', async () => {
  expect((await PUT(request({ enabled: false }, 'https://evil.example'))).status).toBe(403);
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it('rejects arbitrary client recipient IDs', async () => {
  expect((await PUT(request({ enabled: true, telegramUserId: 'other' }))).status).toBe(400);
  expect(db.user.update).not.toHaveBeenCalled();
});
it('requires a current authenticated session', async () => {
  guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await PUT(request({ enabled: true }))).status).toBe(401);
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
