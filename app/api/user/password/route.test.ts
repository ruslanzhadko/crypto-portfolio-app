import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
const crypto = vi.hoisted(() => ({ compare: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: db } }));
vi.mock('bcryptjs', () => ({ default: crypto }));
vi.mock('@/lib/api/auth-guard', () => ({ requireUser: async () => ({ ok: true, user: { id: 'main' } }) }));
vi.mock('@/lib/auth/rate-limit', () => ({ allowAuthAttempt: async () => true, clientAddress: () => 'test' }));
import { PUT } from './route';
function request(currentPassword = 'current', newPassword = 'new-password') {
  return new NextRequest('https://app.example/api/user/password', { method: 'PUT', headers: { origin: 'https://app.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
}
beforeEach(() => { vi.resetAllMocks(); db.findUnique.mockResolvedValue({ passwordHash: 'original-hash' }); crypto.compare.mockResolvedValue(true); crypto.hash.mockResolvedValue('new-hash'); db.updateMany.mockResolvedValue({ count: 1 }); });
it('revokes sessions and uses the compared hash to prevent a concurrent overwrite', async () => {
  expect((await PUT(request())).status).toBe(200);
  expect(db.updateMany).toHaveBeenCalledWith({ where: { id: 'main', passwordHash: 'original-hash', isBlocked: false }, data: { passwordHash: 'new-hash', sessionVersion: { increment: 1 } } });
});
it('returns conflict if password changed while hashing', async () => {
  db.updateMany.mockResolvedValue({ count: 0 });
  expect((await PUT(request())).status).toBe(409);
});
it('requires the existing password', async () => {
  crypto.compare.mockResolvedValue(false);
  expect((await PUT(request())).status).toBe(400);
  expect(db.updateMany).not.toHaveBeenCalled();
});
it('does not invent a password for a Telegram-only account', async () => {
  db.findUnique.mockResolvedValue({ passwordHash: null });
  expect((await PUT(request())).status).toBe(400);
  expect(crypto.compare).not.toHaveBeenCalled();
});
it('rejects passwords that bcrypt would silently truncate', async () => {
  expect((await PUT(request('current', '😀'.repeat(19)))).status).toBe(400);
  expect(crypto.hash).not.toHaveBeenCalled();
});
