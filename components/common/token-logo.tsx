'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { getDexScreenerChainId } from '@/lib/utils/token-links';

interface TokenLogoProps {
  src?: string | null;
  symbol: string;
  size?: number;
  className?: string;
  chainName?: string;
  tokenAddress?: string;
}

const dexLogoCache = new Map<string, string | null>();

export function TokenLogo({
  src, symbol, size = 32, className, chainName, tokenAddress,
}: TokenLogoProps) {
  const [primaryErrored, setPrimaryErrored] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [fallbackErrored, setFallbackErrored] = useState(false);
  const initial = symbol.charAt(0).toUpperCase();
  const dexChain = chainName ? getDexScreenerChainId(chainName) : null;
  const cacheKey = dexChain && tokenAddress ? `${dexChain}:${tokenAddress}` : null;

  useEffect(() => {
    if ((!src || primaryErrored) && cacheKey && dexChain && tokenAddress && !fallbackErrored) {
      if (dexLogoCache.has(cacheKey)) {
        setFallbackSrc(dexLogoCache.get(cacheKey) ?? null);
        return;
      }
      fetch(`https://api.dexscreener.com/tokens/v1/${dexChain}/${tokenAddress}`)
        .then((response) => response.ok ? response.json() : [])
        .then((pairs: Array<{ liquidity?: { usd?: number }; info?: { imageUrl?: string } }>) => {
          const logo = pairs
            .filter((pair) => pair.info?.imageUrl)
            .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
            ?.info?.imageUrl ?? null;
          dexLogoCache.set(cacheKey, logo);
          setFallbackSrc(logo);
        })
        .catch(() => dexLogoCache.set(cacheKey, null));
    }
  }, [src, primaryErrored, fallbackErrored, cacheKey, dexChain, tokenAddress]);

  const imageSrc = src && !primaryErrored ? src : !fallbackErrored ? fallbackSrc : null;

  if (!imageSrc) {
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
      src={imageSrc}
      alt={symbol}
      width={size}
      height={size}
      className={cn('rounded-full bg-surface-2', className)}
      onError={() => {
        if (imageSrc === src) setPrimaryErrored(true);
        else setFallbackErrored(true);
      }}
      unoptimized
    />
  );
}
