'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileText, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TokenLogo } from '@/components/common/token-logo';
import { formatNumber, formatRelativeCompact, shortAddress } from '@/lib/utils/format';
import { getChainDisplayName } from '@/lib/utils/networks';
import { cn } from '@/lib/utils/cn';

interface RecentTransaction {
  id: string;
  hash: string;
  chainName: string;
  type: string;
  tokenSymbol: string | null;
  value: number | null;
  sentValue?: number | null;
  status: string;
  timestamp: string;
  logoUrl: string | null;
  swapOutSymbol?: string | null;
  swapInSymbol?: string | null;
  walletId: string;
  walletLabel: string | null;
  walletAddress: string;
}

const EXPLORER: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  bsc: 'https://bscscan.com/tx/',
  polygon: 'https://polygonscan.com/tx/',
  avalanche: 'https://snowtrace.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
  solana: 'https://solscan.io/tx/',
  xlayer: 'https://explorer.xlayer.xyz/tx/',
  robinhood: 'https://robinhoodchain.blockscout.com/tx/',
};

const TX_META = {
  receive: { icon: ArrowDownLeft, color: 'text-success', bg: 'bg-success/10' },
  transfer: { icon: ArrowDownLeft, color: 'text-success', bg: 'bg-success/10' },
  send: { icon: ArrowUpRight, color: 'text-danger', bg: 'bg-danger/10' },
  swap: { icon: ArrowLeftRight, color: 'text-primary', bg: 'bg-primary/10' },
  contract: { icon: FileText, color: 'text-text-muted', bg: 'bg-surface-2' },
} as const;

export function RecentTransactions() {
  const t = useTranslations('RecentTransactions');
  const locale = useLocale();
  const [transactions, setTransactions] = useState<RecentTransaction[] | null>(null);
  const [partialError, setPartialError] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setTransactions(null);
    setError(false);
    try {
      const response = await fetch('/api/transactions/recent?limit=10');
      if (!response.ok) throw new Error('Recent transactions request failed');
      const data = await response.json() as {
        transactions: RecentTransaction[];
        partialError?: boolean;
      };
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setPartialError(Boolean(data.partialError));
    } catch {
      setError(true);
      setTransactions((current) => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load(true);
    window.addEventListener('wallet-synced', refresh);
    window.addEventListener('portfolio-synced', refresh);
    return () => {
      window.removeEventListener('wallet-synced', refresh);
      window.removeEventListener('portfolio-synced', refresh);
    };
  }, [load]);

  return (
    <Card className="overflow-hidden xl:sticky xl:top-4">
      <CardHeader className="gap-1.5 space-y-0 border-b border-border pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('title')}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-text-muted"
            onClick={() => void load(true)}
            disabled={refreshing || transactions === null}
            aria-label={t('refresh')}
            title={t('refresh')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />
          </Button>
        </div>
        <p className="text-xs text-text-muted">{t('subtitle')}</p>
        {partialError && <p className="text-xs text-warning">{t('partialError')}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {transactions === null ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-2 py-2.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-2.5 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error && transactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium">{t('errorTitle')}</p>
            <p className="mt-1 text-xs text-text-muted">{t('errorDescription')}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
              {t('retry')}
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="mx-auto h-6 w-6 text-text-muted" aria-hidden />
            <p className="mt-3 text-sm font-medium">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs text-text-muted">{t('emptyDescription')}</p>
          </div>
        ) : (
          <div className={cn('divide-y divide-border/70 transition-opacity', refreshing && 'opacity-60')}>
            {transactions.map((transaction) => (
              <TransactionRow
                key={`${transaction.walletId}:${transaction.chainName}:${transaction.id}`}
                transaction={transaction}
                locale={locale}
                walletFallback={t('walletFallback')}
                failedLabel={t('failed')}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionRow({
  transaction,
  locale,
  walletFallback,
  failedLabel,
}: {
  transaction: RecentTransaction;
  locale: string;
  walletFallback: string;
  failedLabel: string;
}) {
  const meta = TX_META[transaction.type as keyof typeof TX_META] ?? TX_META.contract;
  const Icon = meta.icon;
  const explorer = EXPLORER[transaction.chainName];
  const isSwap = transaction.type === 'swap';
  const walletName = transaction.walletLabel?.trim() || `${walletFallback} ${shortAddress(transaction.walletAddress, 4)}`;
  const tokenLabel = isSwap
    ? `${transaction.swapOutSymbol ?? '?'} → ${transaction.swapInSymbol ?? '?'}`
    : transaction.tokenSymbol ?? '—';
  const valueLabel = isSwap
    ? `${transaction.sentValue == null ? '—' : formatNumber(transaction.sentValue, 4)} → ${transaction.value == null ? '—' : formatNumber(transaction.value, 4)}`
    : `${transaction.type === 'send' ? '−' : transaction.type === 'receive' || transaction.type === 'transfer' ? '+' : ''}${transaction.value == null ? '—' : formatNumber(transaction.value, 4)}`;
  const content = (
    <>
      <div className="relative shrink-0">
        <TokenLogo
          src={transaction.logoUrl}
          symbol={transaction.tokenSymbol ?? tokenLabel}
          chainName={transaction.chainName}
          size={36}
        />
        <span className={cn('absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full ring-2 ring-surface', meta.bg, meta.color)}>
          <Icon className="h-2.5 w-2.5" aria-hidden />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{tokenLabel}</p>
          <p className={cn('shrink-0 text-xs font-medium tabular-nums', meta.color)}>{valueLabel}</p>
        </div>
        <p className="mt-1 truncate text-xs text-text-muted" title={`${walletName} · ${transaction.walletAddress}`}>
          {walletName} · {getChainDisplayName(transaction.chainName)}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-muted">
          <span suppressHydrationWarning>{formatRelativeCompact(transaction.timestamp, locale)}</span>
          {transaction.status !== 'success' && <span className="text-danger">{failedLabel}</span>}
        </div>
      </div>
    </>
  );

  const className = 'flex min-w-0 gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';
  return explorer ? (
    <a href={`${explorer}${transaction.hash}`} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
