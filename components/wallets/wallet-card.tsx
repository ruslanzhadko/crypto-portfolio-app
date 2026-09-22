'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  ExternalLink,
  MoreVertical,
  RefreshCw,
  Trash2,
  Wallet as WalletIcon,
} from 'lucide-react';
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

function tokenLabel(
  t: ReturnType<typeof useTranslations<'WalletCard'>>,
  count: number,
) {
  if (count === 1) return t('tokenWord1');
  if (count >= 2 && count <= 4) return t('tokenWord2_4');
  return t('tokenWordMany');
}

export interface WalletCardData {
  id: string;
  address: string;
  network: Network;
  label: string | null;
  lastSyncAt: string | Date | null;
  tokenCount: number;
  totalUsd: number;
  change24hUsd: number;
  change24hPct: number;
}

interface WalletCardProps {
  wallet: WalletCardData;
  portfolioTotalUsd: number;
}

export function WalletCard({ wallet, portfolioTotalUsd }: WalletCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('WalletCard');
  const locale = useLocale();

  useEffect(() => setMounted(true), []);

  async function onSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/wallets/${wallet.id}/sync`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast({
          variant: 'destructive',
          title: t('toastSyncFailedTitle'),
          description: body?.error?.message ?? t('toastSyncFailedUnknown'),
        });
        return;
      }
      const data = (await res.json()) as {
        result?: {
          tokensSynced?: number;
          spamFiltered?: number;
          unavailableChains?: string[];
        };
      };
      toast({
        title: t('toastSyncDoneTitle'),
        description: data.result?.unavailableChains?.length
          ? t('robinhoodUnavailable')
          : t('toastSyncDoneDescription', {
              tokens: data.result?.tokensSynced ?? 0,
              spam: data.result?.spamFiltered ?? 0,
            }),
      });
      router.refresh();
    } catch {
      toast({
        variant: 'destructive',
        title: t('toastSyncFailedTitle'),
        description: t('toastSyncFailedUnknown'),
      });
    } finally {
      setIsSyncing(false);
    }
  }

  function onDelete(event: Event) {
    if (!confirmDelete) {
      event.preventDefault();
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/wallets/${wallet.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast({ variant: 'destructive', title: t('toastDeleteFailedTitle') });
        return;
      }
      toast({ title: t('toastDeletedTitle') });
      router.refresh();
    });
  }

  const share =
    portfolioTotalUsd > 0
      ? Math.max(0, Math.min(100, (wallet.totalUsd / portfolioTotalUsd) * 100))
      : 0;
  const shareLabel = share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
  const stale =
    !wallet.lastSyncAt ||
    Date.now() - new Date(wallet.lastSyncAt).getTime() >= 24 * 3_600_000;

  return (
    <Card
      className="card-gradient h-full shadow-none transition-colors hover:border-primary/50 focus-within:border-primary/60"
      data-testid="wallet-card"
    >
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/wallets/${wallet.id}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                wallet.network === Network.SOLANA
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary',
              )}
            >
              <WalletIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-snug tracking-[-0.01em] sm:text-base">
                {wallet.label ?? t('noLabel')}
              </p>
              <p className="font-mono text-xs leading-5 text-text-muted">
                {shortAddress(wallet.address)}
              </p>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={t('moreActions')}
              >
                {isPending || isSyncing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSync} disabled={isSyncing}>
                <RefreshCw
                  className={cn('h-4 w-4', isSyncing && 'animate-spin')}
                />
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

        <div className="mt-4">
          <p className="text-2xl font-semibold leading-none tracking-[-0.025em] tabular-nums sm:text-3xl">
            {formatUsd(wallet.totalUsd, { minimumFractionDigits: 2 })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
            <PriceChange value={wallet.change24hPct} size="sm" />
            <span className="text-text-muted tabular-nums">
              {wallet.change24hUsd >= 0 ? '+' : ''}
              {formatUsd(wallet.change24hUsd, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-text-muted">{t('changePeriod')}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs leading-5 text-text-muted">
          <span>{t('portfolioShareLabel')}</span>
          <span
            className="font-semibold tabular-nums text-text"
            title={`${share.toFixed(2)}%`}
          >
            {shareLabel}
          </span>
        </div>

        <div className="mt-auto flex min-w-0 items-center gap-1.5 pt-3">
          <NetworkBadge network={wallet.network} className="shrink-0" />
          <Badge variant="secondary" className="shrink-0 font-normal">
            {wallet.tokenCount} {tokenLabel(t, wallet.tokenCount)}
          </Badge>
          <p
            className={cn(
              'min-w-0 flex-1 truncate text-xs leading-5',
              stale ? 'text-warning' : 'text-text-muted',
            )}
            aria-live="polite"
            suppressHydrationWarning
            title={
              mounted
                ? wallet.lastSyncAt
                  ? stale
                    ? t('syncStale', {
                        time: formatRelative(wallet.lastSyncAt, locale),
                      })
                    : t('syncUpdated', {
                        time: formatRelative(wallet.lastSyncAt, locale),
                      })
                  : t('notSynced')
                : undefined
            }
          >
            {mounted
              ? wallet.lastSyncAt
                ? stale
                  ? t('syncStale', {
                      time: formatRelative(wallet.lastSyncAt, locale),
                    })
                  : t('syncUpdated', {
                      time: formatRelative(wallet.lastSyncAt, locale),
                    })
                : t('notSynced')
              : ' '}
          </p>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 sm:w-auto sm:px-3 xl:h-11"
            onClick={onSync}
            disabled={isSyncing}
            aria-label={t('menuSync')}
            title={t('menuSync')}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
            />
            <span className="hidden sm:inline xl:hidden">{t('menuSync')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
