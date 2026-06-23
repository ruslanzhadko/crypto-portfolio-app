'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ExternalLink, MoreVertical, RefreshCw, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { Network } from '@prisma/client';
import { Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NetworkBadge } from '@/components/common/network-badge';
import { PriceChange } from '@/components/common/price-change';
import { formatRelative, formatUsd, shortAddress } from '@/lib/utils/format';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

const NETWORK_ACCENT: Record<Network, string> = {
  [Network.EVM]: '#6c63ff',
  [Network.SOLANA]: '#14f195',
};

function SyncDot({ lastSyncAt }: { lastSyncAt: string | Date | null }) {
  if (!lastSyncAt) return <span className="h-2 w-2 rounded-full bg-danger" />;
  const hours = (Date.now() - new Date(lastSyncAt).getTime()) / 3_600_000;
  if (hours < 1) return <span className="h-2 w-2 rounded-full bg-success" />;
  if (hours < 24) return <span className="h-2 w-2 rounded-full bg-warning" />;
  return <span className="h-2 w-2 rounded-full bg-danger" />;
}

function tokenLabel(t: ReturnType<typeof useTranslations<'WalletCard'>>, count: number) {
  if (count === 1) return t('tokenWord1');
  if (count >= 2 && count <= 4) return t('tokenWord2_4');
  return t('tokenWordMany');
}

interface WalletCardProps {
  wallet: {
    id: string;
    address: string;
    network: Network;
    label: string | null;
    lastSyncAt: string | Date | null;
    tokenCount: number;
    totalUsd: number;
  };
  lastPriceUpdateAt?: Date | string | null;
  portfolioTotalUsd?: number;
  change24hUsd?: number;
  change24hPct?: number;
}

export function WalletCard({ wallet, portfolioTotalUsd, change24hUsd, change24hPct }: WalletCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('WalletCard');
  const locale = useLocale();

  useEffect(() => setMounted(true), []);

  function onSync() {
    startTransition(async () => {
      const res = await fetch(`/api/wallets/${wallet.id}/sync`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: t('toastSyncFailedTitle'),
          description: body?.error?.message ?? t('toastSyncFailedUnknown'),
        });
        return;
      }
      const data = (await res.json()) as {
        result?: { tokensSynced?: number; spamFiltered?: number };
      };
      toast({
        title: t('toastSyncDoneTitle'),
        description: t('toastSyncDoneDescription', {
          tokens: data.result?.tokensSynced ?? 0,
          spam: data.result?.spamFiltered ?? 0,
        }),
      });
      router.refresh();
    });
  }

  function onDelete(event: Event) {
    if (!confirmDelete) {
      event.preventDefault();
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/wallets/${wallet.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast({ variant: 'destructive', title: t('toastDeleteFailedTitle') });
        return;
      }
      toast({ title: t('toastDeletedTitle') });
      router.refresh();
    });
  }

  const share =
    portfolioTotalUsd && portfolioTotalUsd > 0
      ? Math.round((wallet.totalUsd / portfolioTotalUsd) * 100)
      : null;

  return (
    <Card className="group card-gradient relative overflow-hidden transition-shadow hover:shadow-glow" data-testid="wallet-card">
      {/* Network accent strip */}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: NETWORK_ACCENT[wallet.network] }}
      />

      <CardContent className="p-5 pl-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/wallets/${wallet.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <WalletIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{wallet.label ?? t('noLabel')}</p>
              <p className="font-mono text-xs text-text-muted">{shortAddress(wallet.address)}</p>
            </div>
          </Link>

          {/* Sync on hover — desktop only */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 sm:flex"
            onClick={onSync}
            disabled={isPending}
            title={t('syncTitle')}
          >
            <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                {isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSync} disabled={isPending}>
                <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
                {t('menuSync')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/wallets/${wallet.id}`}>
                  <ExternalLink className="h-4 w-4" />
                  {t('menuDetails')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-danger focus:text-danger"
              >
                <Trash2 className="h-4 w-4" />
                {confirmDelete ? t('menuDeleteConfirm') : t('menuDelete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Value row */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight">
              {formatUsd(wallet.totalUsd, { compact: true })}
            </p>
            {wallet.totalUsd > 0 && change24hPct !== undefined && change24hUsd !== undefined && (
              <div className="flex items-center gap-1">
                <PriceChange value={change24hPct} size="sm" />
                <span className="text-xs text-text-muted">
                  {change24hUsd >= 0 ? '+' : ''}
                  {formatUsd(change24hUsd, { compact: true })}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {share !== null && (
              <span className="text-xs text-text-muted">{t('portfolioShare', { share })}</span>
            )}
            <Badge variant="secondary">
              {wallet.tokenCount} {tokenLabel(t, wallet.tokenCount)}
            </Badge>
          </div>
        </div>

        {/* Footer: network + sync status */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <NetworkBadge network={wallet.network} />
          {mounted && (
            <div className="flex items-center gap-1.5" suppressHydrationWarning>
              <SyncDot lastSyncAt={wallet.lastSyncAt} />
              <span className="text-xs text-text-muted">
                {wallet.lastSyncAt
                  ? t('syncStatus', { time: formatRelative(wallet.lastSyncAt, locale) })
                  : t('notSynced')}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
