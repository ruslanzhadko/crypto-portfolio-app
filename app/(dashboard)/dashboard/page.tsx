import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortfolioOverview } from '@/lib/services/portfolio';
import { formatRelative } from '@/lib/utils/format';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { AllocationChart } from '@/components/dashboard/allocation-chart';
import { NetworkAllocationChart } from '@/components/dashboard/network-allocation';
import { PortfolioChart } from '@/components/dashboard/portfolio-chart';
import { TokenTable } from '@/components/dashboard/token-table';
import { WalletList } from '@/components/dashboard/wallet-list';
import { TopMovers } from '@/components/dashboard/top-movers';
import { SyncAllButton } from '@/components/dashboard/sync-all-button';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [overview, wallets, hiddenTokensCount, lastPriceUpdate] = await Promise.all([
    getPortfolioOverview(userId),
    prisma.wallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        // Лише видимі токени (не-спам, не-приховані вручну) — щоб totalUsd і tokenCount
        // збігались з фільтрацією на /wallets і у дашборд-портфелі
        balances: {
          where: { isSpam: false, isHidden: false },
          select: { usdValue: true },
        },
        _count: { select: { balances: { where: { isSpam: false, isHidden: false } } } },
      },
    }),
    prisma.tokenBalance.count({
      where: { wallet: { userId }, isHidden: true, isSpam: false },
    }),
    prisma.tokenBalance.findFirst({
      where: { wallet: { userId }, isSpam: false },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);

  const walletDtos = wallets.map((w) => ({
    id: w.id,
    address: w.address,
    network: w.network,
    label: w.label,
    lastSyncAt: w.lastSyncAt,
    totalUsd: w.balances.reduce((s, b) => s + b.usdValue, 0),
    tokenCount: w._count.balances,
  }));

  const latestSyncAt = wallets.reduce<Date | null>((latest, w) => {
    if (!w.lastSyncAt) return latest;
    if (!latest) return w.lastSyncAt;
    return w.lastSyncAt > latest ? w.lastSyncAt : latest;
  }, null);


  if (overview.walletCount === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-sm text-text-muted">Зведений огляд вашого портфеля.</p>
        </div>
        <EmptyState
          icon={Wallet}
          title="Ще немає гаманців"
          description="Додайте першу публічну адресу, щоб побачити аналітику портфеля."
          action={
            <Button asChild>
              <Link href="/wallets">Додати гаманець</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-sm text-text-muted">Зведений огляд вашого портфеля.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastPriceUpdate?.updatedAt && (
            <span className="text-xs text-text-muted" suppressHydrationWarning>
              Ціни: {formatRelative(lastPriceUpdate.updatedAt)}
            </span>
          )}
          {latestSyncAt && (
            <span className="text-xs text-text-muted" suppressHydrationWarning>
              Sync: {formatRelative(latestSyncAt)}
            </span>
          )}
          <SyncAllButton />
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/compare">Порівняти гаманці</Link>
          </Button>
        </div>
      </div>

      {/*
        Mobile order:  Stats → Tokens → TopMovers → Charts → PfChart
        Desktop order: Stats → TopMovers → Charts → PfChart → Tokens
        Achieved with sm:order-* on a flex-col container.
        Items without an explicit order default to 0 and follow DOM order on mobile.
      */}
      <div className="flex flex-col gap-6">
        <PortfolioSummary data={overview} />

        {/* Tokens: DOM pos 2 → mobile 2nd, desktop last (order 5) */}
        <div className="sm:order-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TokenTable tokens={overview.tokens} />
            </div>
            <WalletList wallets={walletDtos} />
          </div>
        </div>

        {/* TopMovers: DOM pos 3 → mobile 3rd, desktop 2nd (order 1) */}
        <div className="sm:order-1">
          <TopMovers tokens={overview.tokens} />
        </div>

        {/* Allocation charts: DOM pos 4 → mobile 4th, desktop 3rd (order 2) */}
        <div className="sm:order-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <AllocationChart tokens={overview.tokens} />
            <NetworkAllocationChart chains={overview.chains} />
          </div>
        </div>

        {/* Portfolio chart: DOM pos 5 → mobile 5th, desktop 4th (order 3) */}
        <div className="sm:order-3">
          <PortfolioChart
            totalUsd={overview.totalUsd}
            priceChange24h={overview.priceChange24h}
            hiddenTokensCount={hiddenTokensCount}
          />
        </div>
      </div>
    </div>
  );
}
