'use client';

import { useTranslations, useLocale } from 'next-intl';
import { ArrowRight, Wallet as WalletIcon } from 'lucide-react';
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
  const locale = useLocale();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{t('cardTitle')}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/wallets">
            {t('viewAll')} <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {wallets.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-text-muted">
            {t('noWallets')}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {wallets.slice(0, 5).map((w) => (
              <Link
                key={w.id}
                href={`/wallets/${w.id}`}
                className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-surface-2/50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <WalletIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.label ?? t('walletFallback')}</p>
                  <p className="font-mono text-xs text-text-muted">
                    {shortAddress(w.address)} · {formatRelative(w.lastSyncAt, locale)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatUsd(w.totalUsd, { compact: true })}</p>
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
