import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface PriceChangeProps {
  value: number;
  showIcon?: boolean;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}

export function PriceChange({
  value,
  showIcon = true,
  className,
  size = 'default',
}: PriceChangeProps) {
  const isUp = value > 0;
  const isDown = value < 0;
  const isFlat = value === 0 || !Number.isFinite(value);

  const color = isUp
    ? 'text-success'
    : isDown
      ? 'text-danger'
      : 'text-text-muted';

  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        color,
        textSize,
        className,
      )}
    >
      {showIcon && <Icon className={iconSize} />}
      {isFlat ? '0%' : formatPercent(value)}
    </span>
  );
}
