'use client';

import { useMemo, useState } from 'react';
import { Network } from '@prisma/client';
import { useLocale, useTranslations } from 'next-intl';
import { WalletCard, type WalletCardData } from './wallet-card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatUsd } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type Filter = 'all' | Network;
type Sort = 'value' | 'recent' | 'name';

export function WalletGallery({ wallets }: { wallets: WalletCardData[] }) {
  const t = useTranslations('Wallets');
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('value');

  const portfolioTotalUsd = wallets.reduce((sum, wallet) => sum + wallet.totalUsd, 0);
  const counts = {
    all: wallets.length,
    [Network.EVM]: wallets.filter((wallet) => wallet.network === Network.EVM).length,
    [Network.SOLANA]: wallets.filter((wallet) => wallet.network === Network.SOLANA).length,
  };

  const visible = useMemo(() => {
    const filtered = wallets.filter((wallet) => filter === 'all' || wallet.network === filter);
    return filtered.sort((a, b) => {
      if (sort === 'recent') {
        return new Date(b.lastSyncAt ?? 0).getTime() - new Date(a.lastSyncAt ?? 0).getTime();
      }
      if (sort === 'name') {
        return (a.label ?? a.address).localeCompare(b.label ?? b.address, locale);
      }
      return b.totalUsd - a.totalUsd;
    });
  }, [wallets, filter, sort, locale]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: Network.EVM, label: 'EVM' },
    { key: Network.SOLANA, label: 'Solana' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-muted">{t('portfolioValue')}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums sm:text-[28px]">
              {formatUsd(portfolioTotalUsd, { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm font-medium text-text-muted">{t('walletCount', { count: wallets.length })}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2/40 p-1 sm:w-auto" role="group" aria-label={t('filterLabel')}>
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'min-h-11 shrink-0 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  filter === key ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {label} <span className="ml-1 text-xs opacity-75">{counts[key]}</span>
              </button>
            ))}
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger className="h-11 w-full bg-surface text-sm font-medium sm:w-44" aria-label={t('sortLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="value">{t('sortValue')}</SelectItem>
              <SelectItem value="recent">{t('sortRecent')}</SelectItem>
              <SelectItem value="name">{t('sortName')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {visible.map((wallet) => (
            <WalletCard key={wallet.id} wallet={wallet} portfolioTotalUsd={portfolioTotalUsd} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-text-muted">{t('filterEmpty')}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFilter('all')}>
            {t('filterReset')}
          </Button>
        </div>
      )}
    </div>
  );
}
