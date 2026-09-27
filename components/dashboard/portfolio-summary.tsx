'use client';

import { useTranslations } from 'next-intl';
import { Coins, Layers, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const t = useTranslations('PortfolioSummary');

  return (
    <Card className="grid min-w-0 grid-cols-3 divide-x divide-border xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
      <Link
        href="/wallets"
        className="flex min-w-0 flex-col gap-1 p-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary xl:flex-row xl:items-center xl:justify-between xl:gap-2 xl:p-4"
      >
        <div className="flex min-w-0 items-center gap-2 text-text-muted">
          <Wallet className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('wallets')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.walletCount}</span>
      </Link>
      <div className="flex min-w-0 flex-col gap-1 p-3 xl:flex-row xl:items-center xl:justify-between xl:gap-2 xl:p-4">
        <div className="flex min-w-0 items-center gap-2 text-text-muted">
          <Coins className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('uniqueTokens')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.tokenCount}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3 xl:flex-row xl:items-center xl:justify-between xl:gap-2 xl:p-4">
        <div className="flex min-w-0 items-center gap-2 text-text-muted">
          <Layers className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('chains')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.chains.length}</span>
      </div>
    </Card>
  );
}
