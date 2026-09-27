'use client';

import { useTranslations } from 'next-intl';
import { Coins, Layers, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const t = useTranslations('PortfolioSummary');

  return (
    <Card className="grid h-full grid-cols-3 divide-x divide-border xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
      <Link
        href="/wallets"
        className="flex min-w-0 flex-col justify-center gap-2 rounded-l-xl p-3 transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:p-5 xl:rounded-l-none xl:rounded-t-xl"
      >
        <div className="flex items-center gap-2 text-text-muted">
          <Wallet className="hidden h-4 w-4 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('wallets')}</span>
        </div>
        <span className="text-xl font-semibold tabular-nums sm:text-2xl">{data.walletCount}</span>
      </Link>
      <div className="flex min-w-0 flex-col justify-center gap-2 p-3 sm:p-5">
        <div className="flex items-center gap-2 text-text-muted">
          <Coins className="hidden h-4 w-4 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('uniqueTokens')}</span>
        </div>
        <span className="text-xl font-semibold tabular-nums sm:text-2xl">{data.tokenCount}</span>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-2 p-3 sm:p-5">
        <div className="flex items-center gap-2 text-text-muted">
          <Layers className="hidden h-4 w-4 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('chains')}</span>
        </div>
        <span className="text-xl font-semibold tabular-nums sm:text-2xl">{data.chains.length}</span>
      </div>
    </Card>
  );
}
