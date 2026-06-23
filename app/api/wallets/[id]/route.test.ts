import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    wallet: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { GET, DELETE } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';

const mockFindFirst = vi.mocked(prisma.wallet.findFirst);
const mockDelete = vi.mocked(prisma.wallet.delete);
const mockAuth = vi.mocked(auth);

const AUTHED_SESSION = { user: { id: 'u1', email: 'user@test.com', role: 'USER', isBlocked: false } };
const BLOCKED_SESSION = { user: { id: 'u1', email: 'user@test.com', role: 'USER', isBlocked: true } };

const PARAMS = { params: { id: 'w1' } };

// 4 balances: 2 visible, 1 spam, 1 hidden — visible sum = 150.75
const WALLET_WITH_BALANCES = {
  id: 'w1',
  userId: 'u1',
  address: '0xabc',
  network: 'EVM',
  label: null,
  isActive: true,
  lastSyncAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { transactions: 3 },
  balances: [
    { id: 'b1', usdValue: 100.5,  isSpam: false, isHidden: false, tokenSymbol: 'ETH' },
    { id: 'b2', usdValue: 50.25,  isSpam: false, isHidden: false, tokenSymbol: 'USDC' },
    { id: 'b3', usdValue: 9999,   isSpam: true,  isHidden: false, tokenSymbol: 'SPAM' },
    { id: 'b4', usdValue: 8888,   isSpam: false, isHidden: true,  tokenSymbol: 'HID' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION as never);
  mockFindFirst.mockResolvedValue(null);
  mockDelete.mockResolvedValue({ id: 'w1' } as never);
});

describe('GET /api/wallets/[id]', () => {
  it('owner requests wallet → 200, totalUsd excludes spam+hidden', async () => {
    mockFindFirst.mockResolvedValue(WALLET_WITH_BALANCES as never);

    const res = await GET(new Request('http://localhost'), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.wallet.totalUsd).toBeCloseTo(150.75);
  });

  it('all balances returned (full passthrough, not filtered in response)', async () => {
    mockFindFirst.mockResolvedValue(WALLET_WITH_BALANCES as never);

    const res = await GET(new Request('http://localhost'), PARAMS);
    const body = await res.json();

    expect(body.wallet.balances).toHaveLength(4);
  });

  it('query uses userId filter (IDOR prevention)', async () => {
    mockFindFirst.mockResolvedValue(WALLET_WITH_BALANCES as never);

    await GET(new Request('http://localhost'), PARAMS);

    const findArgs = mockFindFirst.mock.calls[0]![0] as { where: { id: string; userId: string } };
    expect(findArgs.where.id).toBe('w1');
    expect(findArgs.where.userId).toBe('u1');
  });

  it('non-existent wallet → 404 NOT_FOUND', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it("other user's wallet returns 404, not 403 (ownership via userId filter)", async () => {
    // findFirst returns null because userId doesn't match — same as "not found"
    mockFindFirst.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(404);
  });

  it('unauthenticated → 401 UNAUTHORIZED', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('blocked user → 403 FORBIDDEN', async () => {
    mockAuth.mockResolvedValue(BLOCKED_SESSION as never);

    const res = await GET(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it('response body contains totalUsd and all balances (shape contract)', async () => {
    mockFindFirst.mockResolvedValue(WALLET_WITH_BALANCES as never);

    const res = await GET(new Request('http://localhost'), PARAMS);
    const body = await res.json();

    expect(body.wallet.totalUsd).toBeCloseTo(150.75);
    expect(body.wallet.id).toBe('w1');
    expect(body.wallet.balances).toHaveLength(4);
  });

  it('Prisma throws → 500 INTERNAL_ERROR', async () => {
    mockFindFirst.mockRejectedValue(new Error('DB timeout'));

    const res = await GET(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});

describe('DELETE /api/wallets/[id]', () => {
  beforeEach(() => {
    mockFindFirst.mockResolvedValue({ id: 'w1' } as never);
  });

  it('owner deletes → 204 empty body', async () => {
    const res = await DELETE(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(204);
    const text = await res.text();
    expect(text).toBe('');
  });

  it('findFirst is called with userId filter before delete (ownership check order)', async () => {
    await DELETE(new Request('http://localhost'), PARAMS);

    const findArgs = mockFindFirst.mock.calls[0]![0] as { where: { id: string; userId: string } };
    expect(findArgs.where.id).toBe('w1');
    expect(findArgs.where.userId).toBe('u1');

    const deleteArgs = mockDelete.mock.calls[0]![0] as { where: { id: string } };
    expect(deleteArgs.where.id).toBe('w1');

    expect(mockFindFirst).toHaveBeenCalledBefore(mockDelete as never);
  });

  it('non-existent / other user wallet → 404, delete not called', async () => {
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
    mockAuth.mockResolvedValue(BLOCKED_SESSION as never);

    const res = await DELETE(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('Prisma delete throws → 500 INTERNAL_ERROR', async () => {
    mockDelete.mockRejectedValue(new Error('DB error'));

    const res = await DELETE(new Request('http://localhost'), PARAMS);

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
