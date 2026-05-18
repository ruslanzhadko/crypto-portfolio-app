import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function LoadingSpinner({
  className,
  size = 'default',
}: {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}) {
  const sizeClass =
    size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  return (
    <Loader2
      className={cn('animate-spin text-text-muted', sizeClass, className)}
    />
  );
}
