import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findMany: vi.fn(),
  getWalletTransactions: vi.fn(),
}));

vi.mock('@/lib/api/auth-guard', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { wallet: { findMany: mocks.findMany } } }));
vi.mock('@/app/api/wallets/[id]/transactions/route', () => ({ GET: mocks.getWalletTransactions }));

import { GET } from './route';

const wallets = [
  { id: 'busy', address: 'busy-address', network: 'SOLANA', label: 'Busy' },
  { id: 'quiet', address: 'quiet-address', network: 'EVM', label: 'Quiet' },
];

describe('recent transaction wallet selection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'user' } });
    mocks.findMany.mockResolvedValue(wallets);
    mocks.getWalletTransactions.mockImplementation(async (request, { params }) => {
      const chain = new URL(request.url).searchParams.get('chain');
      const transactions = (await params).id === 'busy'
        ? Array.from({ length: 20 }, (_, id) => ({ id: String(id), chainName: 'solana', timestamp: '2026-09-28T12:00:00Z' }))
        : [{ id: chain ?? 'bsc', chainName: chain ?? 'bsc', timestamp: '2026-09-27T12:00:00Z' }];
      return Response.json({ transactions, hasMore: false });
    });
  });

  it('loads the selected wallet even when its history is outside the global latest 20', async () => {
    const global = await (await GET(new Request('https://example.com/api/transactions/recent'))).json();
    expect(global.transactions.every((tx: { walletId: string }) => tx.walletId === 'busy')).toBe(true);
    mocks.getWalletTransactions.mockClear();

    const selected = await (await GET(new Request('https://example.com/api/transactions/recent?walletId=quiet'))).json();
    expect(selected.transactions).toHaveLength(4);
    expect(selected.transactions.every((tx: { walletId: string }) => tx.walletId === 'quiet')).toBe(true);
    expect(selected.transactions.map((tx: { chainName: string }) => tx.chainName).sort()).toEqual(['bsc', 'hypercore', 'hyperevm', 'robinhood']);
    expect(selected.wallets).toHaveLength(2);
    const requestedIds = await Promise.all(mocks.getWalletTransactions.mock.calls.map(async ([, context]) => (await context.params).id));
    expect(requestedIds.every(id => id === 'quiet')).toBe(true);
  });

  it('keeps load-more requests scoped to the selected wallet', async () => {
    await GET(new Request('https://example.com/api/transactions/recent?walletId=busy&limit=40'));
    expect(mocks.getWalletTransactions).toHaveBeenCalledTimes(1);
    const [request, context] = mocks.getWalletTransactions.mock.calls[0]!;
    expect((await context.params).id).toBe('busy');
    expect(new URL(request.url).searchParams.get('pageSize')).toBe('40');
  });

  it('does not fetch a wallet outside the authenticated user’s active wallets', async () => {
    const response = await GET(new Request('https://example.com/api/transactions/recent?walletId=someone-else'));
    expect(response.status).toBe(404);
    expect(mocks.findMany.mock.calls[0]![0].where).toEqual({ userId: 'user', isActive: true });
    expect(mocks.getWalletTransactions).not.toHaveBeenCalled();
  });
});
