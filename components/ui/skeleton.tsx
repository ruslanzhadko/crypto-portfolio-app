import { cn } from '@/lib/utils/cn';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-2 before:absolute before:inset-0 before:-translate-x-full before:animate-sweep before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent motion-reduce:before:hidden',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
