'use client';

import { useTranslations } from 'next-intl';
import { Coins, Layers, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { TokenLogo } from '@/components/common/token-logo';
import { formatUsd } from '@/lib/utils/format';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const t = useTranslations('PortfolioSummary');
  const largestPositions = [...data.tokens]
    .filter((token) => token.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, 4);

  return (
    <Card className="grid min-w-0 grid-cols-3 divide-x divide-border xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
      <Link
        href="/wallets"
        className="flex min-w-0 flex-col gap-1 p-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary xl:min-h-11 xl:flex-row xl:items-center xl:justify-between xl:gap-2 xl:px-3 xl:py-2"
      >
        <div className="flex min-w-0 items-center gap-2 text-text-muted">
          <Wallet className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('wallets')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.walletCount}</span>
      </Link>
      <div className="flex min-w-0 flex-col gap-1 p-3 xl:min-h-11 xl:flex-row xl:items-center xl:justify-between xl:gap-2 xl:px-3 xl:py-2">
        <div className="flex min-w-0 items-center gap-2 text-text-muted">
          <Coins className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('uniqueTokens')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.tokenCount}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3 xl:min-h-11 xl:flex-row xl:items-center xl:justify-between xl:gap-2 xl:px-3 xl:py-2">
        <div className="flex min-w-0 items-center gap-2 text-text-muted">
          <Layers className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="text-xs sm:text-sm">{t('chains')}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums sm:text-xl">{data.chains.length}</span>
      </div>
      {largestPositions.length > 0 && (
        <div className="col-span-3 border-t border-border px-3 py-3 xl:col-span-1 xl:px-3 xl:py-3">
          <h2 className="mb-2 text-xs font-medium text-text-muted">{t('largestPositions')}</h2>
          <ul className="space-y-2">
            {largestPositions.map((token) => (
              <li key={token.key} className="flex min-w-0 items-center gap-2">
                <TokenLogo
                  src={token.logoUrl}
                  symbol={token.symbol}
                  size={24}
                  chainName={token.chainName}
                  tokenAddress={token.tokenAddress}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{token.symbol}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-medium tabular-nums">{formatUsd(token.totalUsd, { compact: true })}</span>
                  <span className="block text-[11px] text-text-muted tabular-nums">{token.share.toFixed(1)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
