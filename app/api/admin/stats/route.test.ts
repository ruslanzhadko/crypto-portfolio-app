import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { count: vi.fn() },
    wallet: { count: vi.fn() },
    priceTrigger: { count: vi.fn() },
    notificationLog: { count: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { GET } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';

const mockUserCount = vi.mocked(prisma.user.count);
const mockWalletCount = vi.mocked(prisma.wallet.count);
const mockTriggerCount = vi.mocked(prisma.priceTrigger.count);
const mockNotifCount = vi.mocked(prisma.notificationLog.count);
const mockAuth = vi.mocked(auth);

const ADMIN_SESSION = { user: { id: 'a1', email: 'admin@test.com', role: 'ADMIN', isBlocked: false } };
const USER_SESSION = { user: { id: 'u1', email: 'user@test.com', role: 'USER', isBlocked: false } };

function setupCountMocks(values: {
  totalUsers: number;
  blockedUsers: number;
  totalWallets: number;
  activeTriggers: number;
  notifications24h: number;
  notificationsSent: number;
  notificationsFailed: number;
}) {
  // user.count is called twice: once for total, once for blocked
  mockUserCount
    .mockResolvedValueOnce(values.totalUsers as never)
    .mockResolvedValueOnce(values.blockedUsers as never);
  mockWalletCount.mockResolvedValue(values.totalWallets as never);
  mockTriggerCount.mockResolvedValue(values.activeTriggers as never);
  // notificationLog.count is called 3 times
  mockNotifCount
    .mockResolvedValueOnce(values.notifications24h as never)
    .mockResolvedValueOnce(values.notificationsSent as never)
    .mockResolvedValueOnce(values.notificationsFailed as never);
}

const DEFAULT_COUNTS = {
  totalUsers: 100, blockedUsers: 5, totalWallets: 50,
  activeTriggers: 20, notifications24h: 15, notificationsSent: 200, notificationsFailed: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockAuth.mockResolvedValue(ADMIN_SESSION as never);
  setupCountMocks(DEFAULT_COUNTS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/admin/stats', () => {
  describe('auth and access control', () => {
    it('admin → 200 with all 7 stat fields', async () => {
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.stats).toEqual({
        totalUsers: 100,
        blockedUsers: 5,
        totalWallets: 50,
        activeTriggers: 20,
        notifications24h: 15,
        notificationsSent: 200,
        notificationsFailed: 10,
      });
    });

    it('non-admin user → 403 FORBIDDEN', async () => {
      mockAuth.mockResolvedValue(USER_SESSION as never);

      expect((await GET()).status).toBe(403);
    });

    it('unauthenticated → 401 UNAUTHORIZED', async () => {
      mockAuth.mockResolvedValue(null);

      expect((await GET()).status).toBe(401);
    });
  });

  describe('query correctness', () => {
    it('blockedUsers count uses where: { isBlocked: true }', async () => {
      await GET();

      const calls = mockUserCount.mock.calls;
      const blockedCall = calls.find(
        (c) => (c[0] as { where?: { isBlocked?: boolean } } | undefined)?.where?.isBlocked === true,
      );
      expect(blockedCall).toBeDefined();
    });

    it('activeTriggers count uses where: { isActive: true }', async () => {
      await GET();

      const triggerArgs = mockTriggerCount.mock.calls[0]![0] as { where: { isActive: boolean } };
      expect(triggerArgs.where.isActive).toBe(true);
    });

    it('notifications24h uses sentAt gte exactly 24h ago', async () => {
      const NOW = new Date('2024-06-01T12:00:00.000Z');
      vi.setSystemTime(NOW);
      // Re-setup mocks after timer change
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(ADMIN_SESSION as never);
      setupCountMocks(DEFAULT_COUNTS);

      await GET();

      const notif24hArgs = mockNotifCount.mock.calls[0]![0] as {
        where: { sentAt: { gte: Date } };
      };
      const expectedSince = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
      expect(notif24hArgs.where.sentAt.gte).toEqual(expectedSince);
    });

    it('notificationsSent uses where: { status: "sent" }', async () => {
      await GET();

      const sentCall = mockNotifCount.mock.calls.find(
        (c) => (c[0] as { where?: { status?: string } } | undefined)?.where?.status === 'sent',
      );
      expect(sentCall).toBeDefined();
    });

    it('notificationsFailed uses where: { status: "failed" }', async () => {
      await GET();

      const failedCall = mockNotifCount.mock.calls.find(
        (c) => (c[0] as { where?: { status?: string } } | undefined)?.where?.status === 'failed',
      );
      expect(failedCall).toBeDefined();
    });

    it('all 7 counts are awaited (each mock called at least once)', async () => {
      await GET();

      expect(mockUserCount).toHaveBeenCalledTimes(2);   // total + blocked
      expect(mockWalletCount).toHaveBeenCalledTimes(1);
      expect(mockTriggerCount).toHaveBeenCalledTimes(1);
      expect(mockNotifCount).toHaveBeenCalledTimes(3);  // 24h + sent + failed
    });
  });

  it('DB throws → 500 INTERNAL_ERROR', async () => {
    // mockReset clears the Once queue from beforeEach, then set rejection
    mockUserCount.mockReset();
    mockUserCount.mockRejectedValue(new Error('DB down'));

    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
