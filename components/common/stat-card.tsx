import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PriceChange } from '@/components/common/price-change';
import { cn } from '@/lib/utils/cn';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <Card className={cn('card-gradient', className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text-muted">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-text-muted" />}
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        {typeof delta === 'number' && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <PriceChange value={delta} size="sm" />
            {deltaLabel && <span className="text-text-muted">{deltaLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
