'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowRight, Wallet as WalletIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NetworkBadge } from '@/components/common/network-badge';
import { Button } from '@/components/ui/button';
import { LowValueFilter, useLowValueFilter } from '@/components/common/low-value-filter';
import { formatRelative, formatUsd, shortAddress } from '@/lib/utils/format';
import type { Network } from '@prisma/client';

interface WalletDTO {
  id: string;
  address: string;
  network: Network;
  label: string | null;
  lastSyncAt: string | null;
  totalUsd: number;
  tokenCount: number;
}

export function WalletList({ wallets }: { wallets: WalletDTO[] }) {
  const t = useTranslations('WalletList');
  const dashboard = useTranslations('Dashboard');
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [hideLowValue, setHideLowValue] = useLowValueFilter('wallets');
  const lowValue = useTranslations('LowValueFilter');
  const topWallets = [...wallets]
    .filter((wallet) => !hideLowValue || wallet.totalUsd >= 1)
    .sort((left, right) => right.totalUsd - left.totalUsd)
    .slice(0, 5);

  useEffect(() => setMounted(true), []);

  return (
    <Card className="h-full">
      <CardHeader className="gap-2 space-y-0 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('cardTitle')}</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/compare">{dashboard('compareWallets')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/wallets">
                {t('viewAll')} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
        <LowValueFilter checked={hideLowValue} onCheckedChange={setHideLowValue} />
      </CardHeader>
      <CardContent className="p-0">
        {wallets.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-text-muted">
            {t('noWallets')}
          </p>
        ) : topWallets.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-text-muted" role="status">{lowValue('emptyWallets')}</p>
        ) : (
          <div className="divide-y divide-border">
            {topWallets.map((w) => (
              <Link
                key={w.id}
                href={`/wallets/${w.id}`}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <WalletIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.label ?? t('walletFallback')}</p>
                  <p className="font-mono text-xs text-text-muted">
                    {shortAddress(w.address)} · {mounted ? formatRelative(w.lastSyncAt, locale) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatUsd(w.totalUsd, { compact: true, minimumFractionDigits: 2 })}</p>
                  <NetworkBadge network={w.network} className="text-[10px]" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
