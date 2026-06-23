import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Network } from '@prisma/client';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    wallet: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { GET, POST } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';

const mockFindMany = vi.mocked(prisma.wallet.findMany);
const mockFindUnique = vi.mocked(prisma.wallet.findUnique);
const mockCreate = vi.mocked(prisma.wallet.create);
const mockAuth = vi.mocked(auth);

const AUTHED_SESSION = { user: { id: 'u1', email: 'user@test.com', role: 'USER', isBlocked: false } };
const BLOCKED_SESSION = { user: { id: 'u1', email: 'user@test.com', role: 'USER', isBlocked: true } };

const EVM_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const SOL_ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeWallet(overrides = {}) {
  return {
    id: 'w1',
    userId: 'u1',
    address: EVM_ADDRESS.toLowerCase(),
    network: Network.EVM,
    label: null,
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date(),
    _count: { balances: 2, transactions: 5 },
    balances: [{ usdValue: 100.5 }, { usdValue: 50.25 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION as never);
  mockFindMany.mockResolvedValue([]);
  mockFindUnique.mockResolvedValue(null);
  mockCreate.mockResolvedValue({ id: 'w1', address: EVM_ADDRESS.toLowerCase(), network: Network.EVM } as never);
});

describe('GET /api/wallets', () => {
  it('authenticated → 200 with mapped wallets (totalUsd, tokenCount, txCount)', async () => {
    const wallet = makeWallet();
    mockFindMany.mockResolvedValue([wallet] as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.wallets).toHaveLength(1);
    expect(body.wallets[0].totalUsd).toBeCloseTo(150.75);
    expect(body.wallets[0].tokenCount).toBe(2);
    expect(body.wallets[0].transactionCount).toBe(5);
    expect(body.wallets[0].userId).toBeUndefined();
  });

  it('no wallets → 200 with empty array', async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.wallets).toEqual([]);
  });

  it('query is user-scoped (IDOR prevention)', async () => {
    await GET();

    const findArgs = mockFindMany.mock.calls[0]![0] as { where: { userId: string } };
    expect(findArgs.where.userId).toBe('u1');
  });

  it('unauthenticated → 401 UNAUTHORIZED', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('blocked user → 403 FORBIDDEN', async () => {
    mockAuth.mockResolvedValue(BLOCKED_SESSION as never);

    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/wallets', () => {
  it('valid EVM wallet → 201, address lowercased in DB call', async () => {
    const mixedCase = '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045';
    const res = await POST(postRequest({ address: mixedCase, network: 'EVM' }) as never);

    expect(res.status).toBe(201);
    const createArgs = mockCreate.mock.calls[0]![0] as { data: { address: string } };
    expect(createArgs.data.address).toBe(mixedCase.toLowerCase());
  });

  it('valid Solana wallet → 201, address NOT lowercased', async () => {
    mockCreate.mockResolvedValue({ id: 'w2', address: SOL_ADDRESS, network: Network.SOLANA } as never);

    const res = await POST(postRequest({ address: SOL_ADDRESS, network: 'SOLANA' }) as never);

    expect(res.status).toBe(201);
    const createArgs = mockCreate.mock.calls[0]![0] as { data: { address: string } };
    expect(createArgs.data.address).toBe(SOL_ADDRESS);
  });

  it('duplicate wallet → 409 CONFLICT, create not called; dup check uses normalized address', async () => {
    mockFindUnique.mockResolvedValue({ id: 'existing' } as never);

    const mixedCase = '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045';
    const res = await POST(postRequest({ address: mixedCase, network: 'EVM' }) as never);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(mockCreate).not.toHaveBeenCalled();

    const findArgs = mockFindUnique.mock.calls[0]![0] as {
      where: { userId_address_network: { userId: string; address: string; network: string } };
    };
    expect(findArgs.where.userId_address_network.address).toBe(mixedCase.toLowerCase());
    expect(findArgs.where.userId_address_network.userId).toBe('u1');
  });

  it('invalid EVM address → 400 BAD_REQUEST with Zod details', async () => {
    const res = await POST(postRequest({ address: '0x123', network: 'EVM' }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.details).toBeDefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('valid EVM address but wrong network (SOLANA) → 400 (cross-field refine)', async () => {
    const res = await POST(postRequest({ address: EVM_ADDRESS, network: 'SOLANA' }) as never);

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('malformed JSON body → 400', async () => {
    const req = new Request('http://localhost/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('label omitted → create called with label: null', async () => {
    await POST(postRequest({ address: EVM_ADDRESS, network: 'EVM' }) as never);

    const createArgs = mockCreate.mock.calls[0]![0] as { data: { label: unknown } };
    expect(createArgs.data.label).toBeNull();
  });

  it('unauthenticated → 401, no DB write', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(postRequest({ address: EVM_ADDRESS, network: 'EVM' }) as never);

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('blocked user → 403, no DB write', async () => {
    mockAuth.mockResolvedValue(BLOCKED_SESSION as never);

    const res = await POST(postRequest({ address: EVM_ADDRESS, network: 'EVM' }) as never);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('successful create → 201 response body contains wallet, no internal fields leaked', async () => {
    const dbRow = { id: 'w1', address: EVM_ADDRESS.toLowerCase(), network: 'EVM', userId: 'u1', label: null };
    mockCreate.mockResolvedValue(dbRow as never);

    const res = await POST(postRequest({ address: EVM_ADDRESS, network: 'EVM' }) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.wallet.id).toBe('w1');
    expect(body.wallet.address).toBe(EVM_ADDRESS.toLowerCase());
  });

  it('Prisma create throws → 500 INTERNAL_ERROR', async () => {
    mockCreate.mockRejectedValue(new Error('unique constraint violation'));

    const res = await POST(postRequest({ address: EVM_ADDRESS, network: 'EVM' }) as never);

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
