import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    priceTrigger: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tokenPrice: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { PUT, DELETE } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';

const mockFindFirst = vi.mocked(prisma.priceTrigger.findFirst);
const mockFindUnique = vi.mocked(prisma.priceTrigger.findUnique);
const mockUpdate = vi.mocked(prisma.priceTrigger.update);
const mockDelete = vi.mocked(prisma.priceTrigger.delete);
const mockTokenPrice = vi.mocked(prisma.tokenPrice.findUnique);
const mockAuth = vi.mocked(auth);

const AUTHED = { user: { id: 'u1', email: 'u@test.com', role: 'USER', isBlocked: false } };
const BLOCKED = { user: { id: 'u1', email: 'u@test.com', role: 'USER', isBlocked: true } };
const PARAMS = { params: { id: 't1' } };

function putReq(body: unknown): Request {
  return new Request('http://localhost/api/alerts/t1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockAuth.mockResolvedValue(AUTHED as never);
  // Default: ownership check passes
  mockFindFirst.mockResolvedValue({ id: 't1' } as never);
  // Default: trigger was active (no baseline reset on re-enable)
  mockFindUnique.mockResolvedValue({ isActive: true, tokenId: 'bitcoin', tokenSymbol: 'BTC' } as never);
  mockTokenPrice.mockResolvedValue(null);
  mockUpdate.mockResolvedValue({ id: 't1', isActive: true } as never);
  mockDelete.mockResolvedValue({ id: 't1' } as never);
});

// ═══════════════════════════════════════
// PUT /api/alerts/[id]
// ═══════════════════════════════════════

describe('PUT /api/alerts/[id]', () => {
  describe('re-enable logic (baseline reset)', () => {
    it('re-enable previously-inactive trigger + cache hit → lastPrice and lastCheckedAt set', async () => {
      // findFirst (ownership) → found
      mockFindFirst.mockResolvedValue({ id: 't1' } as never);
      // findUnique (read current state) → was inactive, has tokenId
      mockFindUnique.mockResolvedValue({ isActive: false, tokenId: 'bitcoin', tokenSymbol: 'BTC' } as never);
      // tokenPrice cache → has current price
      mockTokenPrice.mockResolvedValue({ currentPrice: 999 } as never);

      const res = await PUT(putReq({ isActive: true }) as never, PARAMS);
      const body = await res.json();

      expect(res.status).toBe(200);

      const updateArgs = mockUpdate.mock.calls[0]![0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };
      expect(updateArgs.where.id).toBe('t1');
      expect(updateArgs.data.isActive).toBe(true);
      expect(updateArgs.data.lastPrice).toBe(999);
      expect(updateArgs.data.lastCheckedAt).toBeInstanceOf(Date);
      expect(body.trigger).toBeDefined();
    });

    it('re-enable + cache miss → lastPrice=null, lastCheckedAt still set', async () => {
      mockFindUnique.mockResolvedValue({ isActive: false, tokenId: 'bitcoin', tokenSymbol: 'BTC' } as never);
      mockTokenPrice.mockResolvedValue(null);

      await PUT(putReq({ isActive: true }) as never, PARAMS);

      const updateArgs = mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(updateArgs.data.lastPrice).toBeNull();
      expect(updateArgs.data.lastCheckedAt).toBeInstanceOf(Date);
    });

    it('tokenPrice.findUnique called with tokenId from DB row, not from request body', async () => {
      mockFindUnique.mockResolvedValue({ isActive: false, tokenId: 'ethereum', tokenSymbol: 'ETH' } as never);
      mockTokenPrice.mockResolvedValue({ currentPrice: 3000 } as never);

      await PUT(putReq({ isActive: true }) as never, PARAMS);

      const priceArgs = mockTokenPrice.mock.calls[0]![0] as { where: { tokenId: string } };
      expect(priceArgs.where.tokenId).toBe('ethereum');
    });

    it('already-active trigger + isActive:true → NO baseline reset', async () => {
      // findUnique returns isActive: true → guard !existing.isActive fails → no reset
      mockFindUnique.mockResolvedValue({ isActive: true, tokenId: 'bitcoin', tokenSymbol: 'BTC' } as never);

      await PUT(putReq({ isActive: true }) as never, PARAMS);

      expect(mockTokenPrice).not.toHaveBeenCalled();
      const updateArgs = mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(updateArgs.data).not.toHaveProperty('lastPrice');
      expect(updateArgs.data).not.toHaveProperty('lastCheckedAt');
    });

    it('disabling active trigger → no baseline reset, tokenPrice not called', async () => {
      // The disable branch only reads tokenSymbol for logging
      mockFindUnique.mockResolvedValue({ tokenSymbol: 'BTC' } as never);

      await PUT(putReq({ isActive: false }) as never, PARAMS);

      expect(mockTokenPrice).not.toHaveBeenCalled();
      const updateArgs = mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(updateArgs.data.isActive).toBe(false);
      expect(updateArgs.data).not.toHaveProperty('lastPrice');
      expect(updateArgs.data).not.toHaveProperty('lastCheckedAt');
    });

    it('empty body {} → 200, update called with no baseline keys (neither re-enable nor disable branch runs)', async () => {
      const res = await PUT(putReq({}) as never, PARAMS);

      expect(res.status).toBe(200);
      const updateArgs = mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(updateArgs.data).not.toHaveProperty('lastPrice');
      expect(updateArgs.data).not.toHaveProperty('lastCheckedAt');
      expect(mockTokenPrice).not.toHaveBeenCalled();
    });
  });

  describe('ownership and auth', () => {
    it('ownership query uses userId (IDOR prevention)', async () => {
      await PUT(putReq({ isActive: true }) as never, PARAMS);

      const findArgs = mockFindFirst.mock.calls[0]![0] as { where: { id: string; userId: string } };
      expect(findArgs.where.id).toBe('t1');
      expect(findArgs.where.userId).toBe('u1');
    });

    it('trigger not found → 404, update and baseline reads NOT called', async () => {
      mockFindFirst.mockResolvedValue(null);

      const res = await PUT(putReq({ isActive: true }) as never, PARAMS);

      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockTokenPrice).not.toHaveBeenCalled();
    });

    it('unauthenticated → 401, update not called', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await PUT(putReq({ isActive: true }) as never, PARAMS);
      expect(res.status).toBe(401);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('blocked user → 403, update not called', async () => {
      mockAuth.mockResolvedValue(BLOCKED as never);
      const res = await PUT(putReq({ isActive: true }) as never, PARAMS);
      expect(res.status).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('invalid interval (14, min=15) → 400, update and tokenPrice NOT called', async () => {
      const res = await PUT(putReq({ interval: 14 }) as never, PARAMS);
      expect(res.status).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockTokenPrice).not.toHaveBeenCalled();
    });

    it('malformed JSON body → 400, update not called', async () => {
      const req = new Request('http://localhost/api/alerts/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      });
      const res = await PUT(req as never, PARAMS);
      expect(res.status).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it('update throws → 500 INTERNAL_ERROR', async () => {
    mockUpdate.mockRejectedValue(new Error('DB error'));
    const res = await PUT(putReq({ isActive: false }) as never, PARAMS);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});

// ═══════════════════════════════════════
// DELETE /api/alerts/[id]
// ═══════════════════════════════════════

describe('DELETE /api/alerts/[id]', () => {
  it('owner deletes → 204 empty body', async () => {
    const res = await DELETE(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('findFirst called with userId before delete (ownership order)', async () => {
    await DELETE(new Request('http://localhost'), PARAMS);

    const findArgs = mockFindFirst.mock.calls[0]![0] as { where: { id: string; userId: string } };
    expect(findArgs.where.id).toBe('t1');
    expect(findArgs.where.userId).toBe('u1');

    const deleteArgs = mockDelete.mock.calls[0]![0] as { where: { id: string } };
    expect(deleteArgs.where.id).toBe('t1');

    expect(mockFindFirst).toHaveBeenCalledBefore(mockDelete as never);
  });

  it('not found → 404, delete not called', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await DELETE(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('unauthenticated → 401, delete not called', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), PARAMS);
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('blocked user → 403, delete not called', async () => {
    mockAuth.mockResolvedValue(BLOCKED as never);
    const res = await DELETE(new Request('http://localhost'), PARAMS);
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('delete throws → 500 INTERNAL_ERROR', async () => {
    mockDelete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(new Request('http://localhost'), PARAMS);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
