import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NetworkBadge } from '@/components/common/network-badge';
import { TokenBalanceList } from '@/components/wallets/token-balance-list';
import { WalletTransactions } from '@/components/wallets/wallet-transactions';
import { WalletSyncButton } from '@/components/wallets/wallet-sync-button';
import { formatRelative, formatUsd } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;

  const wallet = await prisma.wallet.findFirst({
    where: { id, userId: session.user.id },
    include: {
      // Завантажуємо всі токени (для списку), але totalUsd — лише видимі
      balances: { orderBy: { usdValue: 'desc' } },
    },
  });

  if (!wallet) notFound();

  const t = await getTranslations('WalletDetail');
  const locale = await getLocale();

  const totalUsd = wallet.balances
    .filter((b) => !b.isSpam && !b.isHidden)
    .reduce((s, b) => s + b.usdValue, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/wallets">
            <ChevronLeft className="h-4 w-4" />
            {t('backToWallets')}
          </Link>
        </Button>
      </div>

      <Card className="card-gradient shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1.5 sm:space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-xl font-bold sm:text-2xl md:text-3xl">
                  {wallet.label ?? t('noLabel')}
                </h1>
                <NetworkBadge network={wallet.network} />
              </div>
              <p className="break-all font-mono text-xs leading-5 text-text-muted sm:text-sm">
                {wallet.address}
              </p>
              <p className="text-[11px] text-text-muted sm:text-xs">
                {wallet.lastSyncAt
                  ? t('lastSync', { time: formatRelative(wallet.lastSyncAt, locale) })
                  : t('notSynced')}
              </p>
            </div>
            <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-3 md:block md:border-0 md:pt-0 md:text-right">
              <div>
                <p className="text-[11px] text-text-muted sm:text-xs">{t('valueLabel')}</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {formatUsd(totalUsd, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <WalletSyncButton walletId={wallet.id} className="h-9 shrink-0 md:mt-3" />
            </div>
          </div>
        </CardContent>
      </Card>

      <TokenBalanceList walletId={wallet.id} tokens={wallet.balances} totalUsd={totalUsd} />

      <WalletTransactions walletId={wallet.id} walletAddress={wallet.address} network={wallet.network} />
    </div>
  );
}
