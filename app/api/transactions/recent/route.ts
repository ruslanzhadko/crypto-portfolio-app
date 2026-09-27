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

const EVM_TRANSACTION_NETWORKS = [
  'ethereum', 'bsc', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'base', 'xlayer',
];

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

    const requestedLimit = Number.parseInt(new URL(req.url).searchParams.get('limit') ?? '20', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 5), 100) : 20;
    const wallets = await prisma.wallet.findMany({
      where: { userId: guard.user.id, isActive: true },
      select: { id: true, address: true, network: true, label: true },
      orderBy: { createdAt: 'desc' },
    });

    const sources = wallets.flatMap((wallet) => [
      {
        wallet,
        chain: null as string | null,
        networks: wallet.network === 'EVM' ? EVM_TRANSACTION_NETWORKS : ['solana'],
      },
      ...(wallet.network === 'EVM' ? [{ wallet, chain: 'robinhood', networks: ['robinhood'] }] : []),
    ]);
    const settled = await mapWithConcurrency(sources, 4, async ({ wallet, chain }) => {
      const transactions: RecentTransaction[] = [];
      let pageToken: string | undefined;
      let hasMore = false;

      for (let pageNumber = 0; pageNumber < 3 && transactions.length < limit; pageNumber++) {
        const url = new URL(`/api/wallets/${wallet.id}/transactions`, req.url);
        url.searchParams.set('pageSize', String(Math.min(limit - transactions.length, 50)));
        if (chain) url.searchParams.set('chain', chain);
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await getWalletTransactions(
          new NextRequest(url, { headers: req.headers }),
          { params: { id: wallet.id } },
        );
        if (!response.ok) throw new Error(`Transaction source failed: ${response.status}`);
        const page = await response.json() as {
          transactions: RecentTransaction[];
          nextPageToken?: string;
          hasMore?: boolean;
        };
        transactions.push(...page.transactions);
        pageToken = page.nextPageToken;
        hasMore = Boolean(page.hasMore && pageToken);
        if (!hasMore) break;
      }

      return {
        hasMore,
        transactions: transactions.map((transaction) => ({
          ...transaction,
          walletId: wallet.id,
          walletLabel: wallet.label,
          walletAddress: wallet.address,
          walletNetwork: wallet.network,
        })),
      };
    });

    const byTransaction = new Map<string, RecentTransaction>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const transaction of result.value.transactions) {
        const key = `${transaction.walletId}:${transaction.chainName}:${transaction.id ?? transaction.hash}`;
        byTransaction.set(key, transaction);
      }
    }

    const unavailableNetworks = [...new Set(settled.flatMap((result, index) =>
      result.status === 'rejected' ? (sources[index]?.networks ?? []) : []))];

    const sorted = [...byTransaction.values()]
      .filter((transaction) => Boolean(transaction.timestamp))
      .sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)));
    const cleanTransactions = sorted.filter((transaction) => !transaction.isSpam);
    const clean = cleanTransactions.slice(0, limit);
    const spam = sorted.filter((transaction) => transaction.isSpam).slice(0, 10);
    const transactions = [...clean, ...spam]
      .sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)));

    return ok({
      transactions,
      spamCount: spam.length,
      hasMore: cleanTransactions.length > limit
        || settled.some((result) => result.status === 'fulfilled' && result.value.hasMore),
      wallets: wallets.map((wallet) => ({
        id: wallet.id,
        label: wallet.label,
        address: wallet.address,
      })),
      partialError: unavailableNetworks.length > 0,
      unavailableNetworks,
    });
  } catch (error) {
    return handleUnknown(error);
  }
}
