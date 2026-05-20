'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

  function onToggle(active: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/alerts/${trigger.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: active }),
      });
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Не вдалось оновити' });
        return;
      }
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/alerts/${trigger.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Не вдалось видалити' });
        return;
      }
      toast({ title: 'Тригер видалено' });
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDelete} className="text-danger focus:text-danger">
          <Trash2 className="h-4 w-4" />
          Видалити
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
  const directionLabel =
    trigger.direction === TriggerDirection.UP
      ? '↑ зростання'
      : trigger.direction === TriggerDirection.DOWN
        ? '↓ падіння'
        : '↑↓ обидва';

  const intervalLabel =
    trigger.interval >= 60
      ? `${(trigger.interval / 60).toFixed(0)}г`
      : `${trigger.interval}хв`;

  return (
    <Card className="card-gradient">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{trigger.tokenSymbol}</p>
              <p className="truncate text-xs text-text-muted">{trigger.tokenName}</p>
            </div>
          </div>
          <TriggerMenu isPending={isPending} onDelete={onDelete} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-text-muted">Поріг</p>
            <p className="font-medium">±{trigger.threshold}%</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Напрямок</p>
            <p className="font-medium">{directionLabel}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Інтервал</p>
            <p className="font-medium">{intervalLabel}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Перевірено</p>
            <p className="text-xs font-medium">{formatRelative(trigger.lastCheckedAt)}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <Badge variant={trigger.isActive ? 'success' : 'secondary'}>
            {trigger.isActive ? 'Активний' : 'Вимкнено'}
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
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{trigger.tokenSymbol}</p>
              <p className="truncate text-xs text-text-muted">{trigger.tokenName}</p>
            </div>
          </div>
          <TriggerMenu isPending={isPending} onDelete={onDelete} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-text-muted">Ціль</p>
            <p className="font-semibold text-warning">
              {trigger.targetPrice != null ? formatUsd(trigger.targetPrice) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">До цілі</p>
            <p className={`font-semibold ${distanceColor}`}>
              {distanceLabel ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Ціна зараз</p>
            <p className="font-medium">
              {price != null ? formatUsd(price) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Перевірено</p>
            <p className="text-xs font-medium">{formatRelative(trigger.lastCheckedAt)}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          {fired ? (
            <Badge variant="warning">Спрацював</Badge>
          ) : (
            <Badge variant={trigger.isActive ? 'success' : 'secondary'}>
              {trigger.isActive ? 'Очікує' : 'Вимкнено'}
            </Badge>
          )}
          <Switch checked={trigger.isActive} disabled={isPending} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  );
}
