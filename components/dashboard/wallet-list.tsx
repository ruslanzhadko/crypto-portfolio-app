'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowRight, ChevronDown, ChevronUp, Wallet as WalletIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NetworkBadge } from '@/components/common/network-badge';
import { Button } from '@/components/ui/button';
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
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const topWallets = [...wallets]
    .sort((left, right) => right.totalUsd - left.totalUsd)
    .slice(0, 5);

  useEffect(() => {
    setMounted(true);
    try { setCollapsed(localStorage.getItem('portfolio:wallets-collapsed') === 'true'); } catch { /* Storage may be unavailable. */ }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('portfolio:wallets-collapsed', String(next)); } catch { /* Keep the control usable without storage. */ }
  }

  return (
    <Card>
      <CardHeader className="gap-2 space-y-0 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('cardTitle')}</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" className="min-h-11 gap-2 text-text-muted"
              onClick={toggleCollapsed} aria-expanded={!collapsed} aria-controls={contentId}>
              {collapsed ? t('expandList') : t('collapseList')}
              {collapsed ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
            </Button>
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
      </CardHeader>
      <CardContent id={contentId} className="p-0" hidden={collapsed}>
        {wallets.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-text-muted">
            {t('noWallets')}
          </p>
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
