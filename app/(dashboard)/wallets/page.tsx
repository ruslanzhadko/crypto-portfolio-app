import { Wallet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { AddWalletDialog } from '@/components/wallets/add-wallet-dialog';
import { WalletCard } from '@/components/wallets/wallet-card';
import { EmptyState } from '@/components/common/empty-state';

export const dynamic = 'force-dynamic';

export default async function WalletsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const wallets = await prisma.wallet.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { balances: { where: { isSpam: false, isHidden: false } } } },
      balances: {
        where: { isSpam: false, isHidden: false },
        select: { usdValue: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  const data = wallets.map((w) => ({
    id: w.id,
    address: w.address,
    network: w.network,
    label: w.label,
    lastSyncAt: w.lastSyncAt,
    lastPriceUpdateAt: w.balances[0]?.updatedAt ?? null,
    tokenCount: w._count.balances,
    totalUsd: w.balances.reduce((s, b) => s + b.usdValue, 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Гаманці</h1>
          <p className="text-sm text-text-muted">
            Управління підключеними публічними адресами ({data.length}).
          </p>
        </div>
        <AddWalletDialog />
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Поки що порожньо"
          description="Додайте першу публічну адресу для відстеження балансів."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((w) => (
            <WalletCard
              key={w.id}
              wallet={w}
              lastPriceUpdateAt={w.lastPriceUpdateAt}
              portfolioTotalUsd={data.reduce((s, x) => s + x.totalUsd, 0)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
