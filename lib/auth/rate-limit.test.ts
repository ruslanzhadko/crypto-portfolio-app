import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const counter = vi.hoisted(() => ({ deleteMany: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ authRateLimit: counter }) } }));
import { allowAuthAttempt, clientAddress } from './rate-limit';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('AUTH_SECRET', 'test-only-secret'); counter.upsert.mockResolvedValue({ attempts: 1 }); });
afterEach(() => vi.unstubAllEnvs());
it('hashes private identifiers instead of persisting email or IP', async () => {
  expect(await allowAuthAttempt('login', '1.2.3.4', 'person@example.com')).toBe(true);
  for (const [args] of counter.upsert.mock.calls) {
    expect(args.where.key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain('person@example.com');
    expect(JSON.stringify(args)).not.toContain('1.2.3.4');
    expect(args.update).toEqual({ attempts: { increment: 1 } });
  }
});
it('rejects exhausted pair and IP limits', async () => {
  counter.upsert.mockResolvedValue({ attempts: 61 });
  expect(await allowAuthAttempt('login', '1.2.3.4', 'person@example.com')).toBe(false);
});
it('fails closed when the shared limiter is unavailable', async () => {
  counter.upsert.mockRejectedValue(new Error('DB unavailable'));
  await expect(allowAuthAttempt('login', 'ip')).rejects.toThrow();
});
it('prefers the Vercel trusted address over client forwarded input', () => {
  expect(clientAddress(new Headers({ 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': 'spoof' }))).toBe('1.2.3.4');
});
