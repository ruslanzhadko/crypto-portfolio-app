'use client';

import { useTranslations } from 'next-intl';
import { Coins, Layers, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/common/stat-card';
import { PriceChange } from '@/components/common/price-change';
import { formatUsd } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const t = useTranslations('PortfolioSummary');

  const topChains = data.chains
    .slice(0, 3)
    .map((c) => c.displayName)
    .join(', ');

  return (
    <>
      {/* Mobile: single merged card */}
      <div className="sm:hidden rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">{t('totalValue')}</p>
            <p className="mt-1 text-2xl font-bold">{formatUsd(data.totalUsd, { compact: true })}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <PriceChange value={data.priceChange24h} size="sm" />
              <span className="text-xs text-text-muted">{t('deltaLabel')}</span>
              {typeof data.priceChange24hUsd === 'number' && data.priceChange24hUsd !== 0 && (
                <span className={cn(
                  'text-xs font-medium tabular-nums',
                  data.priceChange24hUsd >= 0 ? 'text-success' : 'text-danger',
                )}>
                  {data.priceChange24hUsd >= 0
                    ? `+$${data.priceChange24hUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                    : `-$${Math.abs(data.priceChange24hUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 rounded-lg p-2 bg-primary/10 text-primary">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
          <Link href="/wallets" className="pr-3">
            <p className="text-xs text-text-muted">{t('wallets')}</p>
            <p className="mt-0.5 text-xl font-bold">{data.walletCount}</p>
          </Link>
          <div className="px-3">
            <p className="text-xs text-text-muted">{t('tokens')}</p>
            <p className="mt-0.5 text-xl font-bold">{data.tokenCount}</p>
          </div>
          <div className="pl-3">
            <p className="text-xs text-text-muted">{t('chains')}</p>
            <p className="mt-0.5 text-xl font-bold">{data.chains.length}</p>
          </div>
        </div>
      </div>

      {/* Desktop: 4-column grid */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('totalValue')}
          value={formatUsd(data.totalUsd, { compact: true })}
          delta={data.priceChange24h}
          deltaLabel={t('deltaLabel')}
          deltaUsd={data.priceChange24hUsd}
          icon={TrendingUp}
          iconColor="bg-primary/10 text-primary"
        />
        <StatCard
          label={t('wallets')}
          value={data.walletCount}
          icon={WalletIcon}
          iconColor="bg-sky-500/10 text-sky-400"
          subtext={data.walletCount > 0 ? t('activeNetworks', { count: data.chains.length }) : undefined}
          href="/wallets"
        />
        <StatCard
          label={t('uniqueTokens')}
          value={data.tokenCount}
          icon={Coins}
          iconColor="bg-amber-500/10 text-amber-400"
          subtext={data.tokenCount > 0 ? t('onChains', { count: data.chains.length }) : undefined}
        />
        <StatCard
          label={t('chains')}
          value={data.chains.length}
          icon={Layers}
          iconColor="bg-emerald-500/10 text-emerald-400"
          subtext={topChains || undefined}
        />
      </div>
    </>
  );
}
