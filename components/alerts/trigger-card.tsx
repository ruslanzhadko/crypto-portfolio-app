'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Bell, Loader2, MoreVertical, Target, Trash2 } from 'lucide-react';
import { TriggerDirection, TriggerType, type PriceTrigger } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { formatRelative, formatUsd } from '@/lib/utils/format';
import { useToast } from '@/hooks/use-toast';

interface TriggerCardProps {
  trigger: PriceTrigger;
  currentPrice?: number;
}

export function TriggerCard({ trigger, currentPrice }: TriggerCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const t = useTranslations('TriggerCard');

  function onToggle(active: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/alerts/${trigger.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: active }),
      });
      if (!res.ok) {
        toast({ variant: 'destructive', title: t('toastUpdateFailedTitle') });
        return;
      }
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/alerts/${trigger.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast({ variant: 'destructive', title: t('toastDeleteFailedTitle') });
        return;
      }
      toast({ title: t('toastDeletedTitle') });
      router.refresh();
    });
  }

  const isPercent = trigger.triggerType === TriggerType.PERCENT;

  return isPercent ? (
    <PercentTriggerCard trigger={trigger} isPending={isPending} onToggle={onToggle} onDelete={onDelete} />
  ) : (
    <PriceTargetCard trigger={trigger} currentPrice={currentPrice} isPending={isPending} onToggle={onToggle} onDelete={onDelete} />
  );
}

// ─────────────────────────────────────────
// Shared menu
// ─────────────────────────────────────────

function TriggerMenu({
  isPending,
  onDelete,
}: {
  isPending: boolean;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const t = useTranslations('TriggerCard');

  function handleDelete(event: Event) {
    if (!confirmDelete) {
      // Перший клік: не даємо Radix закрити меню, показуємо крок підтвердження
      event.preventDefault();
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    // Другий клік: меню закривається штатно, виконуємо видалення
    onDelete();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleDelete} className="text-danger focus:text-danger">
          <Trash2 className="h-4 w-4" />
          {confirmDelete ? t('menuDeleteConfirm') : t('menuDelete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────
// PERCENT trigger card
// ─────────────────────────────────────────

function PercentTriggerCard({
  trigger,
  isPending,
  onToggle,
  onDelete,
}: {
  trigger: PriceTrigger;
  isPending: boolean;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('TriggerCard');
  const locale = useLocale();

  const directionLabel =
    trigger.direction === TriggerDirection.UP
      ? t('directionUp')
      : trigger.direction === TriggerDirection.DOWN
        ? t('directionDown')
        : t('directionBoth');

  const intervalLabel =
    trigger.interval >= 60
      ? `${(trigger.interval / 60).toFixed(0)}h`
      : `${trigger.interval}m`;

  return (
    <Card className="card-gradient">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{trigger.tokenSymbol}</p>
              <p className="truncate text-xs text-text-muted">{trigger.tokenName}</p>
            </div>
          </div>
          <TriggerMenu isPending={isPending} onDelete={onDelete} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm sm:mt-4 sm:gap-2">
          <div>
            <p className="text-xs text-text-muted">{t('thresholdLabel')}</p>
            <p className="font-medium">±{trigger.threshold}%</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('directionLabel')}</p>
            <p className="font-medium">{directionLabel}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('intervalLabel')}</p>
            <p className="font-medium">{intervalLabel}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('checkedLabel')}</p>
            <p className="text-xs font-medium">{formatRelative(trigger.lastCheckedAt, locale)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 sm:mt-4 sm:pt-3">
          <Badge variant={trigger.isActive ? 'success' : 'secondary'}>
            {trigger.isActive ? t('badgeActive') : t('badgeInactive')}
          </Badge>
          <Switch checked={trigger.isActive} disabled={isPending} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// PRICE_TARGET trigger card
// ─────────────────────────────────────────

function PriceTargetCard({
  trigger,
  currentPrice,
  isPending,
  onToggle,
  onDelete,
}: {
  trigger: PriceTrigger;
  currentPrice?: number;
  isPending: boolean;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('TriggerCard');
  const locale = useLocale();
  const fired = !trigger.isActive && !!trigger.lastCheckedAt;

  const price = currentPrice ?? trigger.lastPrice ?? null;
  const distancePct =
    price != null && trigger.targetPrice != null
      ? ((trigger.targetPrice - price) / price) * 100
      : null;

  const distanceLabel =
    distancePct != null
      ? `${distancePct > 0 ? '+' : ''}${distancePct.toFixed(1)}%`
      : null;

  const distanceColor =
    distancePct == null
      ? ''
      : Math.abs(distancePct) < 2
        ? 'text-warning'
        : distancePct > 0
          ? 'text-success'
          : 'text-danger';

  return (
    <Card className="card-gradient border-warning/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{trigger.tokenSymbol}</p>
              <p className="truncate text-xs text-text-muted">{trigger.tokenName}</p>
            </div>
          </div>
          <TriggerMenu isPending={isPending} onDelete={onDelete} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm sm:mt-4 sm:gap-2">
          <div>
            <p className="text-xs text-text-muted">{t('targetLabel')}</p>
            <p className="font-semibold text-warning">
              {trigger.targetPrice != null ? formatUsd(trigger.targetPrice) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('distanceLabel')}</p>
            <p className={`font-semibold ${distanceColor}`}>
              {distanceLabel ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('currentPriceLabel')}</p>
            <p className="font-medium">
              {price != null ? formatUsd(price) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('checkedLabel')}</p>
            <p className="text-xs font-medium">{formatRelative(trigger.lastCheckedAt, locale)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 sm:mt-4 sm:pt-3">
          {fired ? (
            <Badge variant="warning">{t('badgeFired')}</Badge>
          ) : (
            <Badge variant={trigger.isActive ? 'success' : 'secondary'}>
              {trigger.isActive ? t('badgeWaiting') : t('badgeInactive')}
            </Badge>
          )}
          <Switch checked={trigger.isActive} disabled={isPending} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  );
}
