import { format, formatDistanceToNow } from 'date-fns';

export function formatUsd(value: number, options: { compact?: boolean; minimumFractionDigits?: number } = {}): string {
  const { compact = false, minimumFractionDigits } = options;

  if (!Number.isFinite(value)) return '$0.00';

  if (compact && Math.abs(value) >= 1_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  }

  const fractionDigits = minimumFractionDigits ?? (Math.abs(value) < 1 ? 6 : 2);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatTokenBalance(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value === 0) return '0';
  if (value < 0.0001) return value.toExponential(2);
  if (value < 1) return value.toFixed(6);
  if (value < 1000) return value.toFixed(4);
  return formatNumber(value, 2);
}

export function shortAddress(address: string, chars = 6): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatDate(date: Date | string, pattern = 'PP'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, pattern);
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return 'Never';
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}
