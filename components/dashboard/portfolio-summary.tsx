'use client';

import { useTranslations } from 'next-intl';
import { Coins, Layers, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/common/stat-card';
import { formatUsd } from '@/lib/utils/format';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const t = useTranslations('PortfolioSummary');

  const topChains = data.chains
    .slice(0, 3)
    .map((c) => c.displayName)
    .join(', ');

  return (
    <>
      {/* Mobile: hero card + compact 3-stat row */}
      <div className="space-y-3 sm:hidden">
        <StatCard
          label={t('totalValue')}
          value={formatUsd(data.totalUsd, { compact: true })}
          delta={data.priceChange24h}
          deltaLabel={t('deltaLabel')}
          deltaUsd={data.priceChange24hUsd}
          icon={TrendingUp}
          iconColor="bg-primary/10 text-primary"
        />
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="grid grid-cols-3 divide-x divide-border">
            <Link href="/wallets" className="pr-4">
              <p className="text-xs text-text-muted">{t('wallets')}</p>
              <p className="mt-0.5 text-2xl font-bold">{data.walletCount}</p>
              <p className="text-xs text-text-muted">
                {data.walletCount > 0 ? t('activeNetworks', { count: data.chains.length }) : '—'}
              </p>
            </Link>
            <div className="px-4">
              <p className="text-xs text-text-muted">{t('tokens')}</p>
              <p className="mt-0.5 text-2xl font-bold">{data.tokenCount}</p>
              <p className="text-xs text-text-muted">{t('onChains', { count: data.chains.length })}</p>
            </div>
            <div className="pl-4">
              <p className="text-xs text-text-muted">{t('chains')}</p>
              <p className="mt-0.5 text-2xl font-bold">{data.chains.length}</p>
              <p className="truncate text-xs text-text-muted">{topChains || '—'}</p>
            </div>
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
