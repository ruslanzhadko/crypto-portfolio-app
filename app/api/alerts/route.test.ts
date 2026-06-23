import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    priceTrigger: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    tokenPrice: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { GET, POST } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';

const mockFindMany = vi.mocked(prisma.priceTrigger.findMany);
const mockCreate = vi.mocked(prisma.priceTrigger.create);
const mockTokenPrice = vi.mocked(prisma.tokenPrice.findUnique);
const mockAuth = vi.mocked(auth);

const AUTHED = { user: { id: 'u1', email: 'u@test.com', role: 'USER', isBlocked: false } };
const BLOCKED = { user: { id: 'u1', email: 'u@test.com', role: 'USER', isBlocked: true } };

const PERCENT_PAYLOAD = {
  triggerType: 'PERCENT',
  tokenId: 'bitcoin',
  tokenSymbol: 'BTC',
  tokenName: 'Bitcoin',
  threshold: 5,
  interval: 60,
};

const TARGET_PAYLOAD = {
  triggerType: 'PRICE_TARGET',
  tokenId: 'bitcoin',
  tokenSymbol: 'BTC',
  tokenName: 'Bitcoin',
  targetPrice: 100000,
  direction: 'UP',
};

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockAuth.mockResolvedValue(AUTHED as never);
  mockFindMany.mockResolvedValue([]);
  mockTokenPrice.mockResolvedValue(null);
  mockCreate.mockResolvedValue({ id: 't1' } as never);
});

// ═══════════════════════════════════════
// GET /api/alerts
// ═══════════════════════════════════════

describe('GET /api/alerts', () => {
  it('authenticated → 200, triggers array, query is user-scoped in correct order', async () => {
    const trigger = { id: 't1', userId: 'u1', tokenSymbol: 'BTC' };
    mockFindMany.mockResolvedValue([trigger] as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.triggers).toHaveLength(1);

    const args = mockFindMany.mock.calls[0]![0] as {
      where: { userId: string };
      orderBy: unknown;
    };
    expect(args.where.userId).toBe('u1');
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('unauthenticated → 401 UNAUTHORIZED', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('blocked user → 403 FORBIDDEN', async () => {
    mockAuth.mockResolvedValue(BLOCKED as never);
    expect((await GET()).status).toBe(403);
  });

  it('findMany throws → 500 INTERNAL_ERROR', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});

// ═══════════════════════════════════════
// POST /api/alerts
// ═══════════════════════════════════════

describe('POST /api/alerts', () => {
  describe('PERCENT trigger', () => {
    it('cache hit → 201, lastPrice=cachedPrice, lastCheckedAt set, targetPrice=null', async () => {
      mockTokenPrice.mockResolvedValue({ currentPrice: 1234.5 } as never);

      const res = await POST(postReq(PERCENT_PAYLOAD) as never);
      const data = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };

      expect(res.status).toBe(201);
      expect(data.data.lastPrice).toBe(1234.5);
      expect(data.data.lastCheckedAt).toBeInstanceOf(Date);
      expect(data.data.targetPrice).toBeNull();
      expect(data.data.threshold).toBe(5);
      expect(data.data.interval).toBe(60);
    });

    it('cache miss → 201, lastPrice=null, lastCheckedAt=null', async () => {
      mockTokenPrice.mockResolvedValue(null);

      await POST(postReq(PERCENT_PAYLOAD) as never);
      const data = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };

      expect(data.data.lastPrice).toBeNull();
      expect(data.data.lastCheckedAt).toBeNull();
    });

    it('direction omitted → direction=BOTH (schema default)', async () => {
      const { direction: _d, ...withoutDirection } = { ...PERCENT_PAYLOAD, direction: undefined };
      await POST(postReq(withoutDirection) as never);

      const data = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(data.data.direction).toBe('BOTH');
    });

    it('tokenPrice.findUnique called with correct tokenId', async () => {
      await POST(postReq(PERCENT_PAYLOAD) as never);

      const args = mockTokenPrice.mock.calls[0]![0] as { where: { tokenId: string } };
      expect(args.where.tokenId).toBe('bitcoin');
    });
  });

  describe('PRICE_TARGET trigger', () => {
    it('cache hit → 201, threshold=0, interval=1, targetPrice set', async () => {
      mockTokenPrice.mockResolvedValue({ currentPrice: 50000 } as never);

      await POST(postReq(TARGET_PAYLOAD) as never);
      const data = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };

      expect(data.data.threshold).toBe(0);
      expect(data.data.interval).toBe(1);
      expect(data.data.targetPrice).toBe(100000);
      expect(data.data.lastPrice).toBe(50000);
    });

    it('direction=BOTH → 400 (schema: PRICE_TARGET only allows UP|DOWN)', async () => {
      const res = await POST(postReq({ ...TARGET_PAYLOAD, direction: 'BOTH' }) as never);
      expect(res.status).toBe(400);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('targetPrice=0 → 400 (must be positive, not non-negative)', async () => {
      const res = await POST(postReq({ ...TARGET_PAYLOAD, targetPrice: 0 }) as never);
      expect(res.status).toBe(400);
    });

    it('targetPrice=-5 → 400', async () => {
      const res = await POST(postReq({ ...TARGET_PAYLOAD, targetPrice: -5 }) as never);
      expect(res.status).toBe(400);
    });
  });

  describe('validation errors', () => {
    it.each([
      ['threshold=0 (min=1)', { ...PERCENT_PAYLOAD, threshold: 0 }],
      ['threshold=101 (max=100)', { ...PERCENT_PAYLOAD, threshold: 101 }],
      ['threshold=50.5 (must be int)', { ...PERCENT_PAYLOAD, threshold: 50.5 }],
      ['interval=14 (min=15)', { ...PERCENT_PAYLOAD, interval: 14 }],
      ['interval=1441 (max=1440)', { ...PERCENT_PAYLOAD, interval: 1441 }],
    ])('%s → 400, create not called', async (_label, payload) => {
      const res = await POST(postReq(payload) as never);
      expect(res.status).toBe(400);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('malformed JSON body → 400, create not called', async () => {
      const req = new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      });
      const res = await POST(req as never);
      expect(res.status).toBe(400);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('auth guards', () => {
    it('unauthenticated → 401, no write', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await POST(postReq(PERCENT_PAYLOAD) as never);
      expect(res.status).toBe(401);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('blocked → 403, no write', async () => {
      mockAuth.mockResolvedValue(BLOCKED as never);
      const res = await POST(postReq(PERCENT_PAYLOAD) as never);
      expect(res.status).toBe(403);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  it('create throws → 500 INTERNAL_ERROR', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'));
    const res = await POST(postReq(PERCENT_PAYLOAD) as never);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
