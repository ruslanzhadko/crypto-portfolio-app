'use client';

import { useState, useTransition, type ReactNode } from 'react';
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
import { formatRelativeCompact, formatUsd } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
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
// Compact card shared by both trigger types
// ─────────────────────────────────────────

function TriggerShell({
  trigger,
  icon,
  summary,
  status,
  statusTone,
  isPending,
  onToggle,
  onDelete,
}: {
  trigger: PriceTrigger;
  icon: ReactNode;
  summary: ReactNode;
  status: string;
  statusTone: string;
  isPending: boolean;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('TriggerCard');
  const locale = useLocale();
  return (
    <Card className={cn('card-gradient min-w-0 transition-opacity', !trigger.isActive && 'opacity-70')}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5">
              <span className="font-semibold">{trigger.tokenSymbol}</span>
              <span className="truncate text-xs text-text-muted">{trigger.tokenName}</span>
            </p>
            <p className="truncate text-sm">{summary}</p>
          </div>
          <Switch checked={trigger.isActive} disabled={isPending} onCheckedChange={onToggle} />
          <TriggerMenu isPending={isPending} onDelete={onDelete} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 pl-12 text-xs text-text-muted">
          <span className={cn('inline-flex items-center gap-1.5 font-medium', statusTone)}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {status}
          </span>
          <span className="truncate">
            {t('checkedShort', { time: formatRelativeCompact(trigger.lastCheckedAt, locale) })}
          </span>
        </div>
      </CardContent>
    </Card>
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
    <TriggerShell
      trigger={trigger}
      isPending={isPending}
      onToggle={onToggle}
      onDelete={onDelete}
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bell className="h-4 w-4" />
        </span>
      }
      summary={
        <>
          <span className="font-semibold">±{trigger.threshold}%</span>
          <span className="text-text-muted">
            {' · '}
            {intervalLabel} · {directionLabel}
          </span>
        </>
      }
      status={trigger.isActive ? t('badgeActive') : t('badgeInactive')}
      statusTone={trigger.isActive ? 'text-success' : 'text-text-muted'}
    />
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
  const fired = !trigger.isActive && !!trigger.lastCheckedAt;

  const price = currentPrice ?? trigger.lastPrice ?? null;
  const distancePct =
    price != null && trigger.targetPrice != null
      ? ((trigger.targetPrice - price) / price) * 100
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
    <TriggerShell
      trigger={trigger}
      isPending={isPending}
      onToggle={onToggle}
      onDelete={onDelete}
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <Target className="h-4 w-4" />
        </span>
      }
      summary={
        <>
          <span className="font-semibold text-warning">
            {trigger.targetPrice != null ? formatUsd(trigger.targetPrice) : '—'}
          </span>
          {price != null && (
            <span className="text-text-muted">
              {' · '}
              {t('nowLabel')} {formatUsd(price)}
            </span>
          )}
          {distancePct != null && (
            <span className={cn('font-medium', distanceColor)}>
              {' · '}
              {distancePct > 0 ? '+' : ''}
              {distancePct.toFixed(1)}%
            </span>
          )}
        </>
      }
      status={fired ? t('badgeFired') : trigger.isActive ? t('badgeWaiting') : t('badgeInactive')}
      statusTone={fired ? 'text-warning' : trigger.isActive ? 'text-success' : 'text-text-muted'}
    />
  );
}
