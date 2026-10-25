'use client';

import { useTranslations } from 'next-intl';
import { Network } from '@prisma/client';
import { getChainDisplayName, getChainLogoUrl } from '@/lib/utils/networks';
import { TokenLogo } from '@/components/common/token-logo';
import { cn } from '@/lib/utils/cn';

interface NetworkBadgeProps {
  network: Network;
  className?: string;
}

export function NetworkBadge({ network, className }: NetworkBadgeProps) {
  const t = useTranslations('NetworkBadge');
  const label = network === Network.EVM ? t('evm') : t('solana');
  const color = network === Network.EVM ? '#6c63ff' : '#14f195';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text',
        className,
      )}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

interface ChainBadgeProps {
  chainName: string;
  className?: string;
  /** Logo only on phones; the name stays for screen readers, on hover and from sm up. */
  compact?: boolean;
}

export function ChainBadge({ chainName, className, compact = false }: ChainBadgeProps) {
  return (
    <span
      title={getChainDisplayName(chainName)}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text',
        compact && 'px-1 py-1 sm:px-2 sm:py-0.5',
        className,
      )}
    >
      <TokenLogo
        src={getChainLogoUrl(chainName)}
        symbol={getChainDisplayName(chainName)}
        size={14}
        className="shrink-0 object-contain text-[8px]"
      />
      <span className={cn('min-w-0 truncate', compact && 'sr-only sm:not-sr-only')}>{getChainDisplayName(chainName)}</span>
    </span>
  );
}
