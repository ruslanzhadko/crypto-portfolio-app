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
    [Network.TON]: wallets.filter((wallet) => wallet.network === Network.TON).length,
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
    { key: Network.TON, label: 'TON' },
  ];

  return (
    <div className="space-y-2.5 sm:space-y-3">
      {/* Total on the first line, network filter and sort on the second (one line on wide screens). */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3 sm:px-4 lg:flex-row lg:px-6 lg:py-5 lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 items-baseline justify-between gap-3 lg:block">
          <p className="text-xs text-text-muted lg:text-sm">{t('portfolioValue')}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-semibold leading-tight tabular-nums sm:text-xl lg:text-3xl">
              {formatUsd(portfolioTotalUsd, { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-text-muted lg:text-sm">{t('walletCount', { count: wallets.length })}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface-2/40 p-0.5 [scrollbar-width:none] lg:flex-none [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label={t('filterLabel')}
          >
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'h-7 shrink-0 rounded-md px-2.5 text-xs font-semibold lg:h-8 lg:px-3 lg:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  filter === key ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {label} <span className="ml-0.5 text-[11px] opacity-75">{counts[key]}</span>
              </button>
            ))}
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger className="h-8 w-32 shrink-0 bg-surface text-xs font-medium sm:w-36 lg:h-9 lg:w-44 lg:text-sm" aria-label={t('sortLabel')}>
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
        <div className="grid gap-2.5 sm:gap-3 lg:gap-5 xl:grid-cols-2 min-[1700px]:grid-cols-3">
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
