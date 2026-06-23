import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';

const mockFindMany = vi.mocked(prisma.user.findMany);
const mockCount = vi.mocked(prisma.user.count);
const mockAuth = vi.mocked(auth);

const ADMIN_SESSION = { user: { id: 'a1', email: 'admin@test.com', role: 'ADMIN', isBlocked: false } };
const USER_SESSION = { user: { id: 'u1', email: 'user@test.com', role: 'USER', isBlocked: false } };
const BLOCKED_SESSION = { user: { id: 'a1', email: 'admin@test.com', role: 'ADMIN', isBlocked: true } };

const SAMPLE_USER = {
  id: 'u1',
  email: 'test@test.com',
  name: 'Test',
  role: 'USER',
  isBlocked: false,
  createdAt: new Date(),
  telegramChatId: null,
  _count: { wallets: 2, triggers: 1 },
};

function getRequest(params = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users${params ? '?' + params : ''}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ADMIN_SESSION);
  mockFindMany.mockResolvedValue([SAMPLE_USER]);
  mockCount.mockResolvedValue(1);
});

describe('GET /api/admin/users', () => {
  describe('auth and access control', () => {
    it('admin → 200 with users and pagination', async () => {
      const res = await GET(getRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.users).toHaveLength(1);
      expect(body.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('non-admin user → 403 FORBIDDEN', async () => {
      mockAuth.mockResolvedValue(USER_SESSION);

      const res = await GET(getRequest());

      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN');
    });

    it('unauthenticated → 401 UNAUTHORIZED', async () => {
      mockAuth.mockResolvedValue(null);

      expect((await GET(getRequest())).status).toBe(401);
    });

    it('blocked admin → 403 FORBIDDEN', async () => {
      mockAuth.mockResolvedValue(BLOCKED_SESSION);

      expect((await GET(getRequest())).status).toBe(403);
    });
  });

  describe('passwordHash not exposed', () => {
    it('select clause never includes passwordHash', async () => {
      await GET(getRequest());

      const findArgs = mockFindMany.mock.calls[0]![0] as {
        select: Record<string, unknown>;
      };
      expect(findArgs.select?.passwordHash).toBeFalsy();
      expect(findArgs.select?.id).toBe(true);
      expect(findArgs.select?.email).toBe(true);
    });
  });

  describe('pagination', () => {
    it('default pagination: page=1, pageSize=20, skip=0', async () => {
      await GET(getRequest());

      const args = mockFindMany.mock.calls[0]![0] as { skip: number; take: number };
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
    });

    it('page=2, pageSize=10 → skip=10', async () => {
      await GET(getRequest('page=2&pageSize=10'));

      const args = mockFindMany.mock.calls[0]![0] as { skip: number; take: number };
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
    });

    it('totalPages calculation: 25 items, pageSize=10 → totalPages=3', async () => {
      mockCount.mockResolvedValue(25);
      mockFindMany.mockResolvedValue([]);

      const res = await GET(getRequest('pageSize=10'));
      const body = await res.json();

      expect(body.pagination.totalPages).toBe(3);
    });

    it('pageSize > 100 → 400 BAD_REQUEST', async () => {
      const res = await GET(getRequest('pageSize=101'));

      expect(res.status).toBe(400);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('page=0 (not positive) → 400', async () => {
      const res = await GET(getRequest('page=0'));

      expect(res.status).toBe(400);
    });
  });

  describe('search', () => {
    it('q param → OR filter with email and name contains (case-insensitive)', async () => {
      await GET(getRequest('q=alice'));

      const args = mockFindMany.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(args.where).toEqual({
        OR: [
          { email: { contains: 'alice', mode: 'insensitive' } },
          { name: { contains: 'alice', mode: 'insensitive' } },
        ],
      });
    });

    it('q param is trimmed before use', async () => {
      await GET(getRequest('q=%20alice%20'));

      const args = mockFindMany.mock.calls[0]![0] as { where: { OR?: unknown[] } };
      const emailFilter = (args.where.OR?.[0] as { email: { contains: string } })?.email;
      expect(emailFilter?.contains).toBe('alice');
    });

    it('no q param → no where filter (all users)', async () => {
      await GET(getRequest());

      const args = mockFindMany.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(args.where).toEqual({});
    });

    it('same where clause used for count and findMany', async () => {
      await GET(getRequest('q=bob'));

      const findWhere = (mockFindMany.mock.calls[0]![0] as { where: unknown }).where;
      const countWhere = (mockCount.mock.calls[0]![0] as { where: unknown })?.where;
      expect(findWhere).toEqual(countWhere);
    });
  });

  it('DB throws → 500 INTERNAL_ERROR', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
