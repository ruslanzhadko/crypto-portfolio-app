'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Eye, EyeOff, FileText, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TokenLogo } from '@/components/common/token-logo';
import { ChainBadge } from '@/components/common/network-badge';
import { formatRelativeCompact, formatTokenBalance, shortAddress } from '@/lib/utils/format';
import { getChainDisplayName } from '@/lib/utils/networks';
import { cn } from '@/lib/utils/cn';

interface RecentTransaction {
  id: string;
  hash: string;
  chainName: string;
  type: string;
  tokenSymbol: string | null;
  tokenAddresses?: string[];
  swapOutTokenAddress?: string | null;
  swapInTokenAddress?: string | null;
  value: number | null;
  sentValue?: number | null;
  status: string;
  timestamp: string;
  logoUrl: string | null;
  swapLogoUrl?: string | null;
  swapOutSymbol?: string | null;
  swapInSymbol?: string | null;
  isSpam?: boolean;
  walletId: string;
  walletLabel: string | null;
  walletAddress: string;
}

interface WalletOption { id: string; label: string | null; address: string }

type LoadMode = 'initial' | 'refresh' | 'more';

const INITIAL_LIMIT = 20;
const LIMIT_STEP = 20;
const MAX_LIMIT = 100;

const EXPLORER: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/', bsc: 'https://bscscan.com/tx/',
  polygon: 'https://polygonscan.com/tx/', avalanche: 'https://snowtrace.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/', optimism: 'https://optimistic.etherscan.io/tx/',
  base: 'https://basescan.org/tx/', solana: 'https://solscan.io/tx/',
  xlayer: 'https://explorer.xlayer.xyz/tx/', robinhood: 'https://robinhoodchain.blockscout.com/tx/',
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
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [spamCount, setSpamCount] = useState(0);
  const [partialError, setPartialError] = useState(false);
  const [unavailableNetworks, setUnavailableNetworks] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [walletFilter, setWalletFilter] = useState('all');
  const [chainFilter, setChainFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showSpam, setShowSpam] = useState(false);
  const limitRef = useRef(INITIAL_LIMIT);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (requestedLimit = INITIAL_LIMIT, mode: LoadMode = 'initial') => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(false);
    setLoadingMore(false);
    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'more') setLoadingMore(true);
    else setTransactions(null);
    setError(false);
    try {
      const params = new URLSearchParams({ limit: String(requestedLimit) });
      if (walletFilter !== 'all') params.set('walletId', walletFilter);
      const response = await fetch(`/api/transactions/recent?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Recent transactions request failed');
      const data = await response.json() as {
        transactions: RecentTransaction[]; wallets?: WalletOption[];
        spamCount?: number; partialError?: boolean; unavailableNetworks?: string[]; hasMore?: boolean;
      };
      if (controller.signal.aborted) return;
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setWallets(Array.isArray(data.wallets) ? data.wallets : []);
      setSpamCount(data.spamCount ?? 0);
      setPartialError(Boolean(data.partialError));
      setUnavailableNetworks(Array.isArray(data.unavailableNetworks) ? data.unavailableNetworks : []);
      setHasMore(Boolean(data.hasMore) && requestedLimit < MAX_LIMIT);
      limitRef.current = requestedLimit;
    } catch {
      if (controller.signal.aborted) return;
      setError(true);
      setTransactions((current) => current ?? []);
    } finally {
      if (!controller.signal.aborted) {
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [walletFilter]);

  useEffect(() => {
    limitRef.current = INITIAL_LIMIT;
    setHasMore(false);
    void load(INITIAL_LIMIT);
    return () => requestRef.current?.abort();
  }, [load]);
  useEffect(() => {
    const refresh = () => void load(limitRef.current, 'refresh');
    window.addEventListener('wallet-synced', refresh);
    window.addEventListener('portfolio-synced', refresh);
    return () => {
      window.removeEventListener('wallet-synced', refresh);
      window.removeEventListener('portfolio-synced', refresh);
    };
  }, [load]);

  const chains = useMemo(() => [...new Set((transactions ?? [])
    .filter((transaction) => showSpam || !transaction.isSpam)
    .map((transaction) => transaction.chainName))]
    .sort((a, b) => getChainDisplayName(a).localeCompare(getChainDisplayName(b))), [transactions, showSpam]);

  const filtered = useMemo(() => (transactions ?? []).filter((transaction) => {
    const normalizedType = transaction.type === 'transfer' ? 'receive' : transaction.type;
    return (showSpam || !transaction.isSpam)
      && (walletFilter === 'all' || transaction.walletId === walletFilter)
      && (chainFilter === 'all' || transaction.chainName === chainFilter)
      && (typeFilter === 'all' || normalizedType === typeFilter);
  }), [transactions, showSpam, walletFilter, chainFilter, typeFilter]);

  const filtersActive = walletFilter !== 'all' || chainFilter !== 'all' || typeFilter !== 'all';
  const unavailableNetworkNames = unavailableNetworks.map(getChainDisplayName).join(', ');
  const resetFilters = () => { setWalletFilter('all'); setChainFilter('all'); setTypeFilter('all'); };
  const loadMore = () => void load(Math.min(limitRef.current + LIMIT_STEP, MAX_LIMIT), 'more');
  const typeLabels: Record<string, string> = {
    receive: t('typeReceive'), transfer: t('typeReceive'), send: t('typeSend'),
    swap: t('typeSwap'), contract: t('typeContract'),
  };

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader className="min-w-0 gap-4 space-y-0 border-b border-border p-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base leading-snug sm:text-lg">{t('title')}</CardTitle>
            <p className="mt-2 text-xs text-text-muted">{t('subtitle')}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-text-muted sm:h-9 sm:w-9"
            onClick={() => void load(limitRef.current, 'refresh')} disabled={refreshing || loadingMore || transactions === null}
            aria-label={t('refresh')} title={t('refresh')}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />
          </Button>
        </div>

        {wallets.length > 0 && (
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Select value={walletFilter} onValueChange={setWalletFilter}>
              <SelectTrigger className="col-span-2 h-11 min-w-0 bg-surface text-sm sm:h-9 sm:text-xs" aria-label={t('walletFilter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allWallets')}</SelectItem>
                {wallets.map((wallet) => <SelectItem key={wallet.id} value={wallet.id}>
                  {wallet.label?.trim() || `${t('walletFallback')} ${shortAddress(wallet.address, 4)}`}
                </SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={chainFilter} onValueChange={setChainFilter}>
              <SelectTrigger className="h-11 min-w-0 bg-surface text-sm sm:h-9 sm:text-xs" aria-label={t('networkFilter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allNetworks')}</SelectItem>
                {chains.map((chain) => <SelectItem key={chain} value={chain}>{getChainDisplayName(chain)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-11 min-w-0 bg-surface text-sm sm:h-9 sm:text-xs" aria-label={t('typeFilter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allTypes')}</SelectItem>
                <SelectItem value="receive">{t('typeReceive')}</SelectItem>
                <SelectItem value="send">{t('typeSend')}</SelectItem>
                <SelectItem value="swap">{t('typeSwap')}</SelectItem>
                <SelectItem value="contract">{t('typeContract')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {transactions !== null && wallets.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-text-muted">{t('results', { count: filtered.length })}</span>
            <div className="flex items-center gap-1">
              {spamCount > 0 && <Button variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-muted hover:bg-surface-2 sm:h-8"
                onClick={() => setShowSpam((current) => !current)} aria-pressed={showSpam}>
                {showSpam ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                {showSpam ? t('hideSpam') : t('showSpam', { count: spamCount })}
              </Button>}
              {filtersActive && <Button variant="ghost" size="icon" className="h-11 w-11 text-text-muted sm:h-8 sm:w-8"
                onClick={resetFilters} aria-label={t('resetFilters')} title={t('resetFilters')}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              </Button>}
            </div>
          </div>
        )}
        {partialError && <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-warning" role="status">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p className="text-xs leading-relaxed">
            {unavailableNetworkNames
              ? t('partialError', { networks: unavailableNetworkNames })
              : t('partialErrorUnknown')}
          </p>
        </div>}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col p-0" aria-busy={transactions === null || refreshing || loadingMore}>
        {transactions === null ? <TransactionSkeleton />
          : error && transactions.length === 0 ? <MessageState title={t('errorTitle')} description={t('errorDescription')}>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>{t('retry')}</Button>
          </MessageState>
          : transactions.length === 0 ? <MessageState title={t('emptyTitle')} description={t('emptyDescription')} icon />
          : filtered.length === 0 ? <MessageState title={t('noMatches')} description={t('noMatchesDescription')}>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('resetFilters')}
            </Button>
          </MessageState>
          : <>
            <div className={cn('min-w-0 divide-y divide-border/70 transition-opacity', refreshing && 'opacity-60')}>
              {filtered.map((transaction) => <TransactionRow
                key={`${transaction.walletId}:${transaction.chainName}:${transaction.id}`}
                transaction={transaction} locale={locale} walletFallback={t('walletFallback')}
                failedLabel={t('failed')} spamLabel={t('spam')}
                typeLabel={typeLabels[transaction.type] ?? t('typeContract')}
              />)}
            </div>
          </>}
        {hasMore && <div className="border-t border-border p-3">
          {error && <p className="mb-2 text-sm text-danger" role="alert">{t('errorDescription')}</p>}
          <Button variant="outline" size="sm" className="h-11 w-full gap-2 sm:h-9" onClick={loadMore} disabled={loadingMore || refreshing}>
            {loadingMore && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {loadingMore ? t('loadingMore') : t('loadMore')}
          </Button>
        </div>}
      </CardContent>
    </Card>
  );
}

function TransactionSkeleton() {
  return <div className="space-y-1 p-2">{Array.from({ length: 7 }).map((_, index) =>
    <div key={index} className="flex items-center gap-3 px-2 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-3/5" /><Skeleton className="h-2.5 w-4/5" /></div>
    </div>)}</div>;
}

function MessageState({ title, description, icon = false, children }: {
  title: string; description: string; icon?: boolean; children?: React.ReactNode;
}) {
  return <div className="px-6 py-12 text-center">
    {icon && <FileText className="mx-auto mb-3 h-6 w-6 text-text-muted" aria-hidden />}
    <p className="text-sm font-medium">{title}</p>
    <p className="mx-auto mt-1 max-w-64 text-xs leading-relaxed text-text-muted">{description}</p>{children}
  </div>;
}

function TransactionRow({ transaction, locale, walletFallback, failedLabel, spamLabel, typeLabel }: {
  transaction: RecentTransaction; locale: string; walletFallback: string;
  failedLabel: string; spamLabel: string; typeLabel: string;
}) {
  const meta = TX_META[transaction.type as keyof typeof TX_META] ?? TX_META.contract;
  const Icon = meta.icon;
  const explorer = EXPLORER[transaction.chainName];
  const isSwap = transaction.type === 'swap';
  const walletName = transaction.walletLabel?.trim() || `${walletFallback} ${shortAddress(transaction.walletAddress, 4)}`;
  const outSymbol = transaction.swapOutSymbol ?? transaction.tokenSymbol?.split('→')[0]?.trim() ?? '?';
  const inSymbol = transaction.swapInSymbol ?? transaction.tokenSymbol?.split('→')[1]?.trim() ?? '?';
  const tokenLabel = isSwap ? `${outSymbol} → ${inSymbol}` : transaction.tokenSymbol ?? '—';
  const isZeroValueContract = transaction.type === 'contract' && Number(transaction.value ?? 0) === 0;
  const valueLabel = isZeroValueContract
    ? typeLabel
    : isSwap
    ? `${transaction.sentValue == null ? '—' : formatTokenBalance(transaction.sentValue)} ${outSymbol} → ${transaction.value == null ? '—' : formatTokenBalance(transaction.value)} ${inSymbol}`
    : `${transaction.type === 'send' ? '−' : transaction.type === 'receive' || transaction.type === 'transfer' ? '+' : ''}${transaction.value == null ? '—' : formatTokenBalance(transaction.value)} ${transaction.tokenSymbol ?? ''}`;
  const content = <>
    <div className="relative grid h-11 w-12 shrink-0 place-items-center">
      {isSwap ? <>
        <TokenLogo src={transaction.logoUrl} symbol={outSymbol} chainName={transaction.chainName} tokenAddress={transaction.swapOutTokenAddress ?? undefined} size={34} className="absolute left-0 top-0 ring-2 ring-surface" />
        <TokenLogo src={transaction.swapLogoUrl} symbol={inSymbol} chainName={transaction.chainName} tokenAddress={transaction.swapInTokenAddress ?? undefined} size={30} className="absolute bottom-0 right-0 ring-2 ring-surface" />
      </> : <TokenLogo src={transaction.logoUrl} symbol={transaction.tokenSymbol ?? tokenLabel} chainName={transaction.chainName} tokenAddress={transaction.tokenAddresses?.[0]} size={40} />}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{tokenLabel}</p>
          <p className={cn('mt-0.5 break-words text-xs font-medium tabular-nums', meta.color)}>{valueLabel}</p></div>
        <span className="shrink-0 pt-0.5 text-[11px] text-text-muted" suppressHydrationWarning>{formatRelativeCompact(transaction.timestamp, locale)}</span>
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-text-muted" title={`${walletName} · ${transaction.walletAddress}`}>{walletName}</p>
        <div className="flex min-w-0 max-w-[75%] shrink-0 items-center justify-end gap-1.5">
          <span className={cn('inline-flex h-6 min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium', meta.bg, meta.color)}>
            <Icon className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            {typeLabel}
          </span>
          {transaction.isSpam && <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">{spamLabel}</span>}
          {transaction.status !== 'success' && <span className="text-[10px] font-medium text-danger">{failedLabel}</span>}
          <ChainBadge chainName={transaction.chainName} className="min-w-0 shrink overflow-hidden" />
        </div>
      </div>
    </div>
  </>;
  const className = 'flex min-w-0 items-center gap-2.5 px-4 py-3 transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-3 sm:px-5 sm:py-4';
  return explorer
    ? <a href={`${explorer}${transaction.hash}`} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
    : <div className={className}>{content}</div>;
}
