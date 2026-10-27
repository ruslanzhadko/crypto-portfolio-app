import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
  exchangeConnection: { findMany: vi.fn() },
}));
const guard = vi.hoisted(() => vi.fn());
const signal = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('@/lib/api/auth-guard', () => ({ requireUser: guard }));
vi.mock('@/lib/exchanges/config', () => ({ exchangesEnabled: () => true }));
vi.mock('@/lib/positions/signal', () => ({ markPositionAlertsChanged: signal }));
import { PUT } from './route';

const settings = {
  opened: true,
  closed: true,
  pnlSign: false,
  liquidation: true,
  liquidationPercent: 10,
  excludedConnections: ['mine', 'foreign'],
};
function request(body: unknown, origin = 'https://app.example') {
  return new NextRequest('https://app.example/api/user/position-alerts', {
    method: 'PUT',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  guard.mockResolvedValue({ ok: true, user: { id: 'main' } });
  db.exchangeConnection.findMany.mockResolvedValue([{ id: 'mine' }]);
});
it('saves settings, keeps only own excluded connections and signals the worker', async () => {
  expect((await PUT(request(settings))).status).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: 'main' },
    data: { positionAlerts: { ...settings, excludedConnections: ['mine'] } },
  });
  expect(signal).toHaveBeenCalled();
});
it('accepts half-percent thresholds from 1 to 50 and rejects others and foreign origins', async () => {
  expect((await PUT(request({ ...settings, liquidationPercent: 7.5 }))).status).toBe(200);
  expect((await PUT(request({ ...settings, liquidationPercent: 0.5 }))).status).toBe(400);
  expect((await PUT(request({ ...settings, liquidationPercent: 60 }))).status).toBe(400);
  expect((await PUT(request({ ...settings, liquidationPercent: 7.3 }))).status).toBe(400);
  db.user.update.mockClear();
  expect((await PUT(request(settings, 'https://evil.example'))).status).toBe(403);
  expect(db.user.update).not.toHaveBeenCalled();
});
