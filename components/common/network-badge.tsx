'use client';

import { useTranslations } from 'next-intl';
import { Network } from '@prisma/client';
import { getChainColor, getChainDisplayName } from '@/lib/utils/networks';
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
}

export function ChainBadge({ chainName, className }: ChainBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text',
        className,
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: getChainColor(chainName) }}
      />
      {getChainDisplayName(chainName)}
    </span>
  );
}
