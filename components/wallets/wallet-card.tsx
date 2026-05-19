'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, MoreVertical, RefreshCw, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { Network } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NetworkBadge } from '@/components/common/network-badge';
import { formatRelative, formatUsd, shortAddress } from '@/lib/utils/format';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

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
}

export function WalletCard({ wallet }: WalletCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

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
          title: 'Sync не вдався',
          description: body?.error?.message ?? 'Невідома помилка',
        });
        return;
      }
      const data = (await res.json()) as {
        result?: { tokensSynced?: number; spamFiltered?: number };
      };
      toast({
        title: 'Sync завершено',
        description: `${data.result?.tokensSynced ?? 0} токенів · ${data.result?.spamFiltered ?? 0} спам відфільтровано`,
      });
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/wallets/${wallet.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Не вдалось видалити' });
        return;
      }
      toast({ title: 'Гаманець видалено' });
      router.refresh();
    });
  }

  const tokenWord =
    wallet.tokenCount === 1
      ? 'токен'
      : wallet.tokenCount >= 2 && wallet.tokenCount <= 4
        ? 'токени'
        : 'токенів';

  return (
    <Card className="card-gradient transition-shadow hover:shadow-glow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/wallets/${wallet.id}`}
            className="flex flex-1 items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <WalletIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {wallet.label ?? 'Без назви'}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {shortAddress(wallet.address)}
              </p>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
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
                Sync
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/wallets/${wallet.id}`}>
                  <ExternalLink className="h-4 w-4" />
                  Деталі
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-danger focus:text-danger"
              >
                <Trash2 className="h-4 w-4" />
                {confirmDelete ? 'Підтвердити видалення' : 'Видалити'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <p className="text-2xl font-bold tracking-tight">
            {formatUsd(wallet.totalUsd, { compact: true })}
          </p>
          <span className="text-xs text-text-muted">
            {wallet.tokenCount} {tokenWord}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <NetworkBadge network={wallet.network} />
          <span className="text-xs text-text-muted" suppressHydrationWarning>
            {mounted
              ? wallet.lastSyncAt
                ? `Sync ${formatRelative(wallet.lastSyncAt)}`
                : 'Не синхронізовано'
              : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
