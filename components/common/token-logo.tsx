'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface TokenLogoProps {
  src?: string | null;
  symbol: string;
  size?: number;
  className?: string;
}

export function TokenLogo({ src, symbol, size = 32, className }: TokenLogoProps) {
  const [errored, setErrored] = useState(false);
  const initial = symbol.charAt(0).toUpperCase();

  if (!src || errored) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white',
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={symbol}
      >
        {initial}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={cn('rounded-full bg-surface-2', className)}
      onError={() => setErrored(true)}
      unoptimized
    />
  );
}
