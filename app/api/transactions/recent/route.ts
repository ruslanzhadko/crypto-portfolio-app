import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { handleUnknown, ok } from '@/lib/api/response';
import { GET as getWalletTransactions } from '@/app/api/wallets/[id]/transactions/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface RecentTransaction {
  id?: string;
  hash?: string;
  chainName?: string;
  timestamp?: string;
  isSpam?: boolean;
  [key: string]: unknown;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index]!) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function GET(req: Request) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const requestedLimit = Number.parseInt(new URL(req.url).searchParams.get('limit') ?? '10', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 5), 20) : 10;
    const wallets = await prisma.wallet.findMany({
      where: { userId: guard.user.id, isActive: true },
      select: { id: true, address: true, network: true, label: true },
      orderBy: { createdAt: 'desc' },
    });

    const sources = wallets.flatMap((wallet) => [
      { wallet, chain: null as string | null },
      ...(wallet.network === 'EVM' ? [{ wallet, chain: 'robinhood' }] : []),
    ]);
    const settled = await mapWithConcurrency(sources, 4, async ({ wallet, chain }) => {
      const url = new URL(`/api/wallets/${wallet.id}/transactions`, req.url);
      url.searchParams.set('pageSize', String(Math.min(limit, 12)));
      if (chain) url.searchParams.set('chain', chain);
      const response = await getWalletTransactions(
        new NextRequest(url, { headers: req.headers }),
        { params: { id: wallet.id } },
      );
      if (!response.ok) throw new Error(`Transaction source failed: ${response.status}`);
      const page = await response.json() as { transactions: RecentTransaction[] };
      return page.transactions.map((transaction) => ({
        ...transaction,
        walletId: wallet.id,
        walletLabel: wallet.label,
        walletAddress: wallet.address,
        walletNetwork: wallet.network,
      }));
    });

    const byTransaction = new Map<string, RecentTransaction>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const transaction of result.value) {
        if (transaction.isSpam) continue;
        const key = `${transaction.walletId}:${transaction.chainName}:${transaction.id ?? transaction.hash}`;
        byTransaction.set(key, transaction);
      }
    }

    const transactions = [...byTransaction.values()]
      .filter((transaction) => Boolean(transaction.timestamp))
      .sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)))
      .slice(0, limit);

    return ok({
      transactions,
      partialError: settled.some((result) => result.status === 'rejected'),
    });
  } catch (error) {
    return handleUnknown(error);
  }
}
