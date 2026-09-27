'use client';

import { useTranslations } from 'next-intl';
import { Coins, Layers, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const t = useTranslations('PortfolioSummary');

  return (
    <div className="grid grid-cols-3 divide-x divide-border">
      <Link
        href="/wallets"
        className="flex min-w-0 flex-col gap-1 rounded-md pr-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:pr-5"
      >
        <div className="flex items-center gap-2 text-text-muted">
          <Wallet className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('wallets')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.walletCount}</span>
      </Link>
      <div className="flex min-w-0 flex-col gap-1 px-3 sm:px-5">
        <div className="flex items-center gap-2 text-text-muted">
          <Coins className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('uniqueTokens')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.tokenCount}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 pl-3 sm:pl-5">
        <div className="flex items-center gap-2 text-text-muted">
          <Layers className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('chains')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.chains.length}</span>
      </div>
    </div>
  );
}
