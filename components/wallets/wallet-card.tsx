'use client';

import { startTransition, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ExternalLink, MoreVertical, RefreshCw, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { Network } from '@prisma/client';
import { getChainDisplayName } from '@/lib/utils/networks';
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
import { formatRelativeCompact, formatUsd, shortAddress } from '@/lib/utils/format';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import { runInBackground, useBackgroundTask } from '@/components/dashboard/background-tasks';

function tokenLabel(t: ReturnType<typeof useTranslations<'WalletCard'>>, count: number) {
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
  const [isPending, startDelete] = useTransition();
  // Shared with the wallet page button: the sync keeps running while the user opens other pages.
  const isSyncing = useBackgroundTask(`wallet-sync:${wallet.id}`);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('WalletCard');
  const locale = useLocale();

  function onSync() {
    runInBackground(`wallet-sync:${wallet.id}`, async () => {
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
            ? t('unavailableChains', {
                chains: [...new Set(data.result.unavailableChains.map(getChainDisplayName))].join(
                  ', ',
                ),
              })
            : t('toastSyncDoneDescription', {
                tokens: data.result?.tokensSynced ?? 0,
                spam: data.result?.spamFiltered ?? 0,
              }),
        });
        window.dispatchEvent(new CustomEvent('wallet-synced', { detail: { walletId: wallet.id } }));
        startTransition(() => router.refresh());
      } catch {
        toast({
          variant: 'destructive',
          title: t('toastSyncFailedTitle'),
          description: t('toastSyncFailedUnknown'),
        });
      }
    });
  }

  function onDelete(event: Event) {
    if (!confirmDelete) {
      event.preventDefault();
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startDelete(async () => {
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
    !wallet.lastSyncAt || Date.now() - new Date(wallet.lastSyncAt).getTime() >= 24 * 3_600_000;

  const syncText = wallet.lastSyncAt
    ? t(stale ? 'syncStale' : 'syncUpdated', {
        time: formatRelativeCompact(wallet.lastSyncAt, locale),
      })
    : t('notSynced');

  // Two compact rows: name and value, then networks, tokens, share, freshness and actions.
  return (
    <Card
      className="card-gradient min-w-0 shadow-none transition-colors hover:border-primary/50 focus-within:border-primary/60"
      data-testid="wallet-card"
    >
      <CardContent className="flex flex-col gap-2.5 p-3 sm:p-4 lg:gap-5 lg:p-6">
        <div className="flex items-start gap-2.5 lg:gap-3">
          <Link
            href={`/wallets/${wallet.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:h-11 lg:w-11',
                wallet.network === Network.SOLANA
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary',
              )}
            >
              <WalletIcon className="h-4 w-4 lg:h-5 lg:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight lg:text-lg">
                {wallet.label ?? t('noLabel')}
              </p>
              <p className="truncate font-mono text-[11px] leading-4 text-text-muted lg:mt-0.5 lg:text-sm">
                {shortAddress(wallet.address)}
              </p>
            </div>
          </Link>
          <div className="shrink-0 text-right">
            <p className="text-base font-semibold leading-tight tabular-nums sm:text-lg lg:text-2xl">
              {formatUsd(wallet.totalUsd, { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center justify-end gap-1.5 text-[11px] leading-4 lg:mt-1 lg:text-sm">
              <PriceChange value={wallet.change24hPct} size="sm" />
              <span className="text-text-muted tabular-nums">
                {wallet.change24hUsd >= 0 ? '+' : ''}
                {formatUsd(wallet.change24hUsd, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted lg:gap-2.5 lg:text-sm">
          <NetworkBadge network={wallet.network} className="shrink-0 whitespace-nowrap" />
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px] font-normal lg:px-2 lg:text-sm">
            {wallet.tokenCount} {tokenLabel(t, wallet.tokenCount)}
          </Badge>
          <span
            className="hidden shrink-0 tabular-nums sm:inline"
            title={`${t('portfolioShareLabel')}: ${share.toFixed(2)}%`}
          >
            {shareLabel}
          </span>
          <span
            className={cn('ml-auto min-w-0 truncate text-right', stale && 'text-warning')}
            aria-live="polite"
            suppressHydrationWarning
            title={syncText}
          >
            {/* Phones show only the time; the full phrase stays in the tooltip. */}
            <span className="sm:hidden">
              {wallet.lastSyncAt
                ? formatRelativeCompact(wallet.lastSyncAt, locale)
                : t('notSynced')}
            </span>
            <span className="hidden sm:inline">{syncText}</span>
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0 lg:h-9 lg:w-9"
            onClick={onSync}
            disabled={isSyncing}
            aria-label={t('menuSync')}
            title={t('menuSync')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 lg:h-9 lg:w-9"
                aria-label={t('moreActions')}
              >
                {isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSync} disabled={isSyncing}>
                <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
                {t('menuSync')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/wallets/${wallet.id}`}>
                  <ExternalLink className="h-4 w-4" />
                  {t('menuDetails')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
                <Trash2 className="h-4 w-4" />
                {confirmDelete ? t('menuDeleteConfirm') : t('menuDelete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
