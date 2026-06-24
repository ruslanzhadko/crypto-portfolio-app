import { Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { AddWalletDialog } from '@/components/wallets/add-wallet-dialog';
import { WalletCard } from '@/components/wallets/wallet-card';
import { EmptyState } from '@/components/common/empty-state';

export const dynamic = 'force-dynamic';

export default async function WalletsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const t = await getTranslations('Wallets');

  const wallets = await prisma.wallet.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { balances: { where: { isSpam: false, isHidden: false } } } },
      balances: {
        where: { isSpam: false, isHidden: false },
        select: { usdValue: true, updatedAt: true, priceChange24h: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  const data = wallets.map((w) => {
    const totalUsd = w.balances.reduce((s, b) => s + b.usdValue, 0);
    // Estimate 24h-ago value per balance: prevValue = usdValue / (1 + change/100)
    // Clamp change to avoid division by zero when priceChange24h === -100
    const prevUsd = w.balances.reduce((s, b) => {
      const safeChange = Math.max(-99.9, b.priceChange24h);
      return s + b.usdValue / (1 + safeChange / 100);
    }, 0);
    const change24hUsd = totalUsd - prevUsd;
    const change24hPct = prevUsd > 0 ? (change24hUsd / prevUsd) * 100 : 0;

    return {
      id: w.id,
      address: w.address,
      network: w.network,
      label: w.label,
      lastSyncAt: w.lastSyncAt,
      lastPriceUpdateAt: w.balances[0]?.updatedAt ?? null,
      tokenCount: w._count.balances,
      totalUsd,
      change24hUsd: Number.isFinite(change24hUsd) ? change24hUsd : 0,
      change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-3xl">{t('pageTitle')}</h1>
          <p className="text-sm text-text-muted">
            {t('pageDescription', { count: data.length })}
          </p>
        </div>
        <AddWalletDialog />
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((w) => (
            <WalletCard
              key={w.id}
              wallet={w}
              lastPriceUpdateAt={w.lastPriceUpdateAt}
              portfolioTotalUsd={data.reduce((s, x) => s + x.totalUsd, 0)}
              change24hUsd={w.change24hUsd}
              change24hPct={w.change24hPct}
            />
          ))}
        </div>
      )}
    </div>
  );
}
