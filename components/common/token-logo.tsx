'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { getDexScreenerChainId } from '@/lib/utils/token-links';
import { getChainInfo } from '@/lib/utils/networks';

interface TokenLogoProps {
  src?: string | null;
  symbol: string;
  size?: number;
  className?: string;
  chainName?: string;
  tokenAddress?: string;
}

const dexLogoCache = new Map<string, string | null>();
const pendingDexLogos = new Map<string, Promise<string | null>>();

export function TokenLogo(props: TokenLogoProps) {
  // Error state belongs to an asset/source, not to a recycled list position.
  return <TokenLogoAsset key={`${props.chainName}:${props.tokenAddress}:${props.symbol}:${props.src}`} {...props} />;
}

function TokenLogoAsset({
  src, symbol, size = 32, className, chainName, tokenAddress,
}: TokenLogoProps) {
  const [primaryErrored, setPrimaryErrored] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [fallbackErrored, setFallbackErrored] = useState(false);
  const initial = symbol.charAt(0).toUpperCase();
  const dexChain = chainName ? getDexScreenerChainId(chainName) : null;
  const cacheKey = dexChain && tokenAddress ? `${dexChain}:${tokenAddress}` : null;
  const chainInfo = chainName ? getChainInfo(chainName) : null;
  const nativeLogo = chainInfo && symbol.toUpperCase() === chainInfo.symbol.toUpperCase()
    ? chainInfo.nativeLogoUrl
    : null;

  useEffect(() => {
    let cancelled = false;
    if ((!src || primaryErrored) && cacheKey && dexChain && tokenAddress && !fallbackErrored) {
      if (dexLogoCache.has(cacheKey)) {
        setFallbackSrc(dexLogoCache.get(cacheKey) ?? null);
        return;
      }
      let pending = pendingDexLogos.get(cacheKey);
      if (!pending) {
        pending = fetch(`https://api.dexscreener.com/tokens/v1/${dexChain}/${tokenAddress}`)
        .then((response) => {
          if (!response.ok) throw new Error('Token logo provider unavailable');
          return response.json();
        })
        .then((pairs: Array<{ liquidity?: { usd?: number }; info?: { imageUrl?: string } }>) => {
          if (!Array.isArray(pairs)) throw new Error('Invalid token logo response');
          const logo = pairs
            .filter((pair) => pair.info?.imageUrl)
            .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
            ?.info?.imageUrl ?? null;
          dexLogoCache.set(cacheKey, logo);
          return logo;
        }).finally(() => pendingDexLogos.delete(cacheKey));
        pendingDexLogos.set(cacheKey, pending);
      }
      void pending.then((logo) => { if (!cancelled) setFallbackSrc(logo); }).catch(() => {
        // Do not cache rate limits/timeouts as permanent "no logo" results.
      });
    }
    return () => { cancelled = true; };
  }, [src, primaryErrored, fallbackErrored, cacheKey, dexChain, tokenAddress]);

  const primarySrc = src ?? nativeLogo;
  const imageSrc = primarySrc && !primaryErrored ? primarySrc : !fallbackErrored ? fallbackSrc : null;

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
        if (imageSrc === primarySrc) setPrimaryErrored(true);
        else setFallbackErrored(true);
      }}
      unoptimized
    />
  );
}
