'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Clock, Eye, EyeOff, FileText, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TokenLogo } from '@/components/common/token-logo';
import { ChainBadge } from '@/components/common/network-badge';
import { ExchangeLogo, exchangeName } from '@/components/exchanges/exchange-logo';
import { ExchangeTokenLogo } from '@/components/exchanges/token-logo';
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

/** A deposit or withdrawal of an exchange account (`/api/exchanges/transfers`). */
interface ExchangeTransfer {
  id: string;
  connectionId: string;
  exchange: string;
  accountLabel: string;
  direction: 'deposit' | 'withdrawal';
  asset: string;
  chain: string | null;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  explorerUrl: string | null;
}

interface ExchangeAccount { id: string; exchange: string; label: string }

type Source = 'all' | 'wallets' | 'exchanges';
type Item =
  | { kind: 'wallet'; key: string; timestamp: string; tx: RecentTransaction }
  | { kind: 'exchange'; key: string; timestamp: string; tx: ExchangeTransfer };

/** Exchange accounts share the account filter with wallets under this prefix. */
const EXCHANGE_PREFIX = 'ex:';

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

/**
 * Latest wallet transactions; with `withExchanges` (dashboard "All" tab) also exchange deposits and
 * withdrawals in one list, with an All / Wallets / Exchanges switch; `exchangesOnly` ("Exchanges" tab)
 * lists exchange transfers alone and never asks the wallet providers.
 */
export function RecentTransactions({ withExchanges: withExchangesProp = false, exchangesOnly = false }: {
  withExchanges?: boolean; exchangesOnly?: boolean;
}) {
  const withExchanges = withExchangesProp || exchangesOnly;
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
  const [walletHasMore, setWalletHasMore] = useState(false);
  const [exchangeHasMore, setExchangeHasMore] = useState(false);
  const [walletFilter, setWalletFilter] = useState('all');
  const [chainFilter, setChainFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showSpam, setShowSpam] = useState(false);
  const [source, setSource] = useState<Source>(exchangesOnly ? 'exchanges' : 'all');
  const [transfers, setTransfers] = useState<ExchangeTransfer[]>([]);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [unavailableAccounts, setUnavailableAccounts] = useState<string[]>([]);
  const [exchangeError, setExchangeError] = useState(false);
  const [exchangeLoaded, setExchangeLoaded] = useState(false);
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
      if (walletFilter !== 'all' && !walletFilter.startsWith(EXCHANGE_PREFIX)) params.set('walletId', walletFilter);
      // Exchange history comes from the database in milliseconds, so it is shown without waiting for
      // the slower wallet providers; its failure only adds a warning to the wallet list.
      const exchangeRequest = withExchanges
        ? fetch(`/api/exchanges/transfers?limit=${requestedLimit}`, { signal: controller.signal })
          .then(async (r) => {
            if (!r.ok) throw new Error('Exchange transfers request failed');
            return await r.json() as {
              transfers: ExchangeTransfer[]; accounts: ExchangeAccount[]; unavailable: string[]; hasMore: boolean;
            };
          })
          .catch(() => null)
          .then((exchangeData) => {
            if (controller.signal.aborted) return;
            setExchangeError(exchangeData === null);
            setExchangeLoaded(true);
            setExchangeHasMore(Boolean(exchangeData?.hasMore) && requestedLimit < MAX_LIMIT);
            if (!exchangeData) return;
            setTransfers(Array.isArray(exchangeData.transfers) ? exchangeData.transfers : []);
            setAccounts(Array.isArray(exchangeData.accounts) ? exchangeData.accounts : []);
            setUnavailableAccounts(Array.isArray(exchangeData.unavailable) ? exchangeData.unavailable : []);
          })
        : Promise.resolve();
      if (exchangesOnly) {
        await exchangeRequest;
        if (controller.signal.aborted) return;
        setTransactions([]);
        limitRef.current = requestedLimit;
        return;
      }
      const response = await fetch(`/api/transactions/recent?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Recent transactions request failed');
      const data = await response.json() as {
        transactions: RecentTransaction[]; wallets?: WalletOption[];
        spamCount?: number; partialError?: boolean; unavailableNetworks?: string[]; hasMore?: boolean;
      };
      await exchangeRequest;
      if (controller.signal.aborted) return;
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setWallets(Array.isArray(data.wallets) ? data.wallets : []);
      setSpamCount(data.spamCount ?? 0);
      setPartialError(Boolean(data.partialError));
      setUnavailableNetworks(Array.isArray(data.unavailableNetworks) ? data.unavailableNetworks : []);
      setWalletHasMore(Boolean(data.hasMore) && requestedLimit < MAX_LIMIT);
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
  }, [walletFilter, withExchanges, exchangesOnly]);

  useEffect(() => {
    limitRef.current = INITIAL_LIMIT;
    setWalletHasMore(false);
    setExchangeHasMore(false);
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

  const items = useMemo<Item[]>(() => {
    const wallet: Item[] = source === 'exchanges' ? [] : (transactions ?? [])
      .filter((tx) => showSpam || !tx.isSpam)
      .map((tx) => ({ kind: 'wallet', key: `${tx.walletId}:${tx.chainName}:${tx.id}`, timestamp: tx.timestamp, tx }));
    const exchange: Item[] = !withExchanges || source === 'wallets' ? [] : transfers
      .map((tx) => ({ kind: 'exchange', key: `ex:${tx.id}`, timestamp: tx.timestamp, tx }));
    return [...wallet, ...exchange].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [transactions, transfers, showSpam, source, withExchanges]);

  const chains = useMemo(() => [...new Set(items
    .map((item) => item.kind === 'wallet' ? item.tx.chainName : item.tx.chain)
    .filter((chain): chain is string => Boolean(chain)))]
    .sort((a, b) => getChainDisplayName(a).localeCompare(getChainDisplayName(b))), [items]);

  const filtered = useMemo(() => items.filter((item) => {
    if (item.kind === 'exchange') {
      const transfer = item.tx;
      return (walletFilter === 'all' || walletFilter === `${EXCHANGE_PREFIX}${transfer.connectionId}`)
        && (chainFilter === 'all' || transfer.chain === chainFilter)
        && (typeFilter === 'all' || typeFilter === (transfer.direction === 'deposit' ? 'receive' : 'send'));
    }
    const transaction = item.tx;
    const normalizedType = transaction.type === 'transfer' ? 'receive' : transaction.type;
    return (walletFilter === 'all' || transaction.walletId === walletFilter)
      && (chainFilter === 'all' || transaction.chainName === chainFilter)
      && (typeFilter === 'all' || normalizedType === typeFilter);
  }), [items, walletFilter, chainFilter, typeFilter]);

  const changeSource = (next: Source) => {
    setSource(next);
    // An account of the other kind would leave the list empty.
    if (next !== 'all' && walletFilter !== 'all'
      && walletFilter.startsWith(EXCHANGE_PREFIX) !== (next === 'exchanges')) setWalletFilter('all');
  };
  // Wallet notices and paging do not apply to the exchanges-only list, and the other way round.
  const hasMore = (source !== 'exchanges' && walletHasMore) || (withExchanges && source !== 'wallets' && exchangeHasMore);
  const walletsLoading = transactions === null;
  // With exchanges the list can open on exchange rows while wallet providers are still answering.
  const listLoading = walletsLoading
    && (!withExchanges || !exchangeLoaded || source === 'wallets' || (source === 'all' && transfers.length === 0));
  const hasSources = wallets.length > 0 || (withExchanges && accounts.length > 0);
  const filtersActive = walletFilter !== 'all' || chainFilter !== 'all' || typeFilter !== 'all';
  const unavailableNetworkNames = unavailableNetworks.map(getChainDisplayName).join(', ');
  const resetFilters = () => { setWalletFilter('all'); setChainFilter('all'); setTypeFilter('all'); };
  const loadMore = () => void load(Math.min(limitRef.current + LIMIT_STEP, MAX_LIMIT), 'more');
  const typeLabels: Record<string, string> = {
    receive: t('typeReceive'), transfer: t('typeReceive'), send: t('typeSend'),
    swap: t('typeSwap'), contract: t('typeContract'),
  };
  const sourceLabels: Record<Source, string> = {
    all: t('sourceAll'), wallets: t('sourceWallets'), exchanges: t('sourceExchanges'),
  };
  const allAccountsLabel = !withExchanges || source === 'wallets'
    ? t('allWallets')
    : source === 'exchanges' ? t('allExchangeAccounts') : t('allAccounts');

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader className="min-w-0 gap-4 space-y-0 border-b border-border p-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base leading-snug sm:text-lg">{t('title')}</CardTitle>
            <p className="mt-2 text-xs text-text-muted">{exchangesOnly ? t('subtitleExchanges') : withExchanges ? t('subtitleWithExchanges') : t('subtitle')}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-text-muted sm:h-9 sm:w-9"
            onClick={() => void load(limitRef.current, 'refresh')} disabled={refreshing || loadingMore || transactions === null}
            aria-label={t('refresh')} title={t('refresh')}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />
          </Button>
        </div>

        {withExchanges && !exchangesOnly && hasSources && (
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label={t('sourceFilter')}>
            {(['all', 'wallets', 'exchanges'] as const).map((s) => (
              <Button key={s} variant="ghost" size="sm"
                className={cn('h-9 px-2 text-xs sm:h-8', source === s ? 'bg-surface text-text shadow-sm hover:bg-surface' : 'text-text-muted')}
                aria-pressed={source === s} onClick={() => changeSource(s)}>
                {sourceLabels[s]}
              </Button>
            ))}
          </div>
        )}

        {hasSources && (
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Select value={walletFilter} onValueChange={setWalletFilter}>
              <SelectTrigger className="col-span-2 h-11 min-w-0 bg-surface text-sm sm:h-9 sm:text-xs" aria-label={t('walletFilter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{allAccountsLabel}</SelectItem>
                {source !== 'exchanges' && wallets.map((wallet) => <SelectItem key={wallet.id} value={wallet.id}>
                  {wallet.label?.trim() || `${t('walletFallback')} ${shortAddress(wallet.address, 4)}`}
                </SelectItem>)}
                {withExchanges && source !== 'wallets' && accounts.map((account) =>
                  <SelectItem key={account.id} value={`${EXCHANGE_PREFIX}${account.id}`}>
                    {exchangeName(account.exchange)} · {account.label}
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

        {transactions !== null && hasSources && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-text-muted">{t('results', { count: filtered.length })}</span>
            <div className="flex items-center gap-1">
              {spamCount > 0 && source !== 'exchanges' && <Button variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-muted hover:bg-surface-2 sm:h-8"
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
        {partialError && source !== 'exchanges' && <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-warning" role="status">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p className="text-xs leading-relaxed">
            {unavailableNetworkNames
              ? t('partialError', { networks: unavailableNetworkNames })
              : t('partialErrorUnknown')}
          </p>
        </div>}
        {withExchanges && source !== 'wallets' && (exchangeError || unavailableAccounts.length > 0) && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-warning" role="status">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="text-xs leading-relaxed">
              {exchangeError ? t('exchangesError') : t('exchangesUnavailable', { accounts: unavailableAccounts.join(', ') })}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col p-0" aria-busy={walletsLoading || refreshing || loadingMore}>
        {listLoading ? <TransactionSkeleton />
          : error && items.length === 0 ? <MessageState title={t('errorTitle')} description={t('errorDescription')}>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>{t('retry')}</Button>
          </MessageState>
          : items.length === 0 ? <MessageState title={t('emptyTitle')} description={t('emptyDescription')} icon />
          : filtered.length === 0 ? <MessageState title={t('noMatches')} description={t('noMatchesDescription')}>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('resetFilters')}
            </Button>
          </MessageState>
          : <>
            <div className={cn('min-w-0 divide-y divide-border/70 transition-opacity', refreshing && 'opacity-60')}>
              {filtered.map((item) => item.kind === 'wallet'
                ? <TransactionRow
                  key={item.key}
                  transaction={item.tx} locale={locale} walletFallback={t('walletFallback')}
                  failedLabel={t('failed')} spamLabel={t('spam')}
                  typeLabel={typeLabels[item.tx.type] ?? t('typeContract')}
                />
                : <TransferRow
                  key={item.key}
                  transfer={item.tx} locale={locale}
                  typeLabel={item.tx.direction === 'deposit' ? t('typeDeposit') : t('typeWithdrawal')}
                  failedLabel={t('failed')} pendingLabel={t('pending')}
                />)}
            </div>
            {walletsLoading && source !== 'exchanges' && <TransactionSkeleton rows={2} />}
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

function TransactionSkeleton({ rows = 7 }: { rows?: number }) {
  return <div className="space-y-1 p-2">{Array.from({ length: rows }).map((_, index) =>
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

const TRANSFER_META = {
  deposit: { icon: ArrowDownLeft, color: 'text-success', bg: 'bg-success/10', sign: '+' },
  withdrawal: { icon: ArrowUpRight, color: 'text-danger', bg: 'bg-danger/10', sign: '−' },
} as const;

function TransferRow({ transfer, locale, typeLabel, failedLabel, pendingLabel }: {
  transfer: ExchangeTransfer; locale: string; typeLabel: string; failedLabel: string; pendingLabel: string;
}) {
  const meta = TRANSFER_META[transfer.direction] ?? TRANSFER_META.deposit;
  const Icon = meta.icon;
  const account = `${exchangeName(transfer.exchange)} · ${transfer.accountLabel}`;
  const content = <>
    <div className="relative grid h-11 w-12 shrink-0 place-items-center">
      <ExchangeTokenLogo symbol={transfer.asset} size={40} />
      <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-surface ring-2 ring-surface">
        <ExchangeLogo exchange={transfer.exchange} size={16} />
      </span>
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{transfer.asset}</p>
          <p className={cn('mt-0.5 break-words text-xs font-medium tabular-nums', meta.color)}>
            {meta.sign}{formatTokenBalance(Number(transfer.amount))} {transfer.asset}
          </p></div>
        <span className="shrink-0 pt-0.5 text-[11px] text-text-muted" suppressHydrationWarning>{formatRelativeCompact(transfer.timestamp, locale)}</span>
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-text-muted" title={account}>{account}</p>
        <div className="flex min-w-0 max-w-[75%] shrink-0 items-center justify-end gap-1.5">
          <span className={cn('inline-flex h-6 min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium', meta.bg, meta.color)}>
            <Icon className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            {typeLabel}
          </span>
          {transfer.status === 'pending' && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-warning" title={pendingLabel}>
            {/* Phones keep the clock only: the row has no room for the word next to type and network. */}
            <Clock className="h-3 w-3" aria-hidden /><span className="sr-only sm:not-sr-only">{pendingLabel}</span>
          </span>}
          {transfer.status === 'failed' && <span className="text-[10px] font-medium text-danger">{failedLabel}</span>}
          {transfer.chain && <ChainBadge chainName={transfer.chain} className="min-w-0 shrink overflow-hidden" />}
        </div>
      </div>
    </div>
  </>;
  const className = 'flex min-w-0 items-center gap-2.5 px-4 py-3 transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-3 sm:px-5 sm:py-4';
  return transfer.explorerUrl
    ? <a href={transfer.explorerUrl} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
    : <div className={className}>{content}</div>;
}
