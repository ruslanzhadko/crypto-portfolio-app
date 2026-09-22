'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, FileText, ExternalLink, Search, Eye, EyeOff } from 'lucide-react';
import { ChainBadge } from '@/components/common/network-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatNumber, shortAddress } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { TokenLogo } from '@/components/common/token-logo';
import { cn } from '@/lib/utils/cn';
import { getChainDisplayName } from '@/lib/utils/networks';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TransactionDTO {
  id: string;
  hash: string;
  chainName: string;
  type: string;
  tokenSymbol: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  value: number | null;
  sentValue?: number | null;
  status: string;
  timestamp: string;
  logoUrl: string | null;
  swapLogoUrl?: string | null;
  swapOutSymbol?: string | null;
  swapInSymbol?: string | null;
  isSpam?: boolean;
}

interface TransactionListProps {
  walletId: string;
  walletAddress: string;
  network: 'EVM' | 'SOLANA';
}

type Source = 'default' | 'robinhood';
type CursorState = Record<Source, string | null | undefined>;

function mergeTransactions(existing: TransactionDTO[], incoming: TransactionDTO[]): TransactionDTO[] {
  const byId = new Map<string, TransactionDTO>();
  for (const tx of [...existing, ...incoming]) byId.set(`${tx.chainName}:${tx.id}`, tx);
  return [...byId.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

const EXPLORER: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  bsc:      'https://bscscan.com/tx/',
  polygon:  'https://polygonscan.com/tx/',
  avalanche:'https://snowtrace.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  base:     'https://basescan.org/tx/',
  solana:   'https://solscan.io/tx/',
  xlayer:   'https://explorer.xlayer.xyz/tx/',
  robinhood: 'https://robinhoodchain.blockscout.com/tx/',
};

function explorerUrl(chainName: string, hash: string): string | null {
  const base = EXPLORER[chainName];
  return base ? `${base}${hash}` : null;
}

const TX_STYLE: Record<string, { icon: typeof ArrowDownLeft; color: string; bg: string }> = {
  receive:  { icon: ArrowDownLeft,  color: 'text-success',    bg: 'bg-success/10'  },
  send:     { icon: ArrowUpRight,   color: 'text-danger',     bg: 'bg-danger/10'   },
  swap:     { icon: ArrowLeftRight, color: 'text-primary',    bg: 'bg-primary/10'  },
  transfer: { icon: ArrowDownLeft,  color: 'text-success',    bg: 'bg-success/10'  },
  contract: { icon: FileText,       color: 'text-text-muted', bg: 'bg-surface-2'   },
};

function getTxStyle(type: string, isOutgoing: boolean) {
  return TX_STYLE[type] ?? (isOutgoing ? TX_STYLE.send! : TX_STYLE.receive!);
}

export function TransactionList({ walletId, walletAddress, network }: TransactionListProps) {
  const t = useTranslations('TransactionList');
  const [items, setItems] = useState<TransactionDTO[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chainFilter, setChainFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const cursorsRef = useRef<CursorState>({ default: undefined, robinhood: undefined });
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (loadingRef.current && !reset) return;
    if (reset) {
      requestIdRef.current += 1;
      cursorsRef.current = { default: undefined, robinhood: undefined };
      setItems(null);
      setError(null);
      setHasMore(false);
    } else {
      setLoadingMore(true);
    }
    loadingRef.current = true;
    const requestId = requestIdRef.current;
    const sources: Source[] = network === 'EVM' ? ['default', 'robinhood'] : ['default'];
    const active = sources.filter((source) => cursorsRef.current[source] !== null);
    const responses = await Promise.all(active.map(async (source) => {
      try {
        const cursor = cursorsRef.current[source];
        const url = `/api/wallets/${walletId}/transactions?pageSize=20${source === 'robinhood' ? '&chain=robinhood' : ''}${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Transaction request failed');
        const payload = (await res.json()) as { transactions: TransactionDTO[]; nextPageToken?: string };
        if (!Array.isArray(payload.transactions)) throw new Error('Invalid transaction response');
        return { source, payload };
      } catch {
        return { source, payload: null };
      }
    }));
    if (requestId !== requestIdRef.current) return;

    const successes = responses.filter((response) => response.payload !== null);
    const failed = successes.length !== responses.length;
    for (const { source, payload } of successes) {
      cursorsRef.current[source] = payload!.nextPageToken ?? null;
    }
    if (successes.length === 0) {
      if (reset) setError(t('errorLoad'));
    } else {
      const nextItems = successes.flatMap((response) => response.payload!.transactions);
      setItems((previous) => mergeTransactions(reset ? [] : previous ?? [], nextItems));
      setError(null);
    }
    setPartialError(failed);
    setHasMore(sources.some((source) => cursorsRef.current[source] !== null));
    setLoadingMore(false);
    loadingRef.current = false;
  }, [walletId, network, t]);

  useEffect(() => { void load(true); }, [load]);

  // Рефетч після wallet sync
  useEffect(() => {
    const handler = (e: Event) => {
      const { walletId: sid } = (e as CustomEvent<{ walletId: string }>).detail;
      if (sid !== walletId) return;
      void load(true);
    };
    window.addEventListener('wallet-synced', handler);
    return () => window.removeEventListener('wallet-synced', handler);
  }, [walletId, load]);

  const normalizedSelf = walletAddress.toLowerCase();

  const txLabels: Record<string, string> = {
    receive: t('txReceive'),
    send: t('txSend'),
    swap: t('txSwap'),
    transfer: t('txTransfer'),
    contract: t('txContract'),
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-6 text-sm text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load(true)}>{t('retry')}</Button>
        </CardContent>
      </Card>
    );
  }

  if (items === null) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('cardTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const displayable = items.filter(
    (tx) => tx.tokenSymbol || (tx.value !== null && tx.value > 0),
  );
  const spamCount = displayable.filter((tx) => tx.isSpam).length;
  const visible = displayable.filter((tx) => showSpam || !tx.isSpam);
  const chains = [...new Set(visible.map((tx) => tx.chainName))]
    .sort((a, b) => getChainDisplayName(a).localeCompare(getChainDisplayName(b)));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = visible.filter((tx) =>
    (chainFilter === 'all' || tx.chainName === chainFilter) &&
    (typeFilter === 'all' || tx.type === typeFilter) &&
    (!normalizedQuery || `${tx.tokenSymbol ?? ''} ${tx.hash}`.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const filtersActive = chainFilter !== 'all' || typeFilter !== 'all' || normalizedQuery.length > 0;

  if (visible.length === 0 && !hasMore && spamCount === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="gap-2 space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('cardTitle')}</CardTitle>
          {spamCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => setShowSpam((current) => !current)}>
              {showSpam ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showSpam ? t('hideSpam', { count: spamCount }) : t('showSpam', { count: spamCount })}
            </Button>
          )}
        </div>
        {partialError && <p className="text-xs text-warning">{t('partialLoad')}</p>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border px-6 pb-5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-52">
            <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              className="pl-9"
            />
          </div>
          <Select value={chainFilter} onValueChange={setChainFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t('networkFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allNetworks')}</SelectItem>
              {chains.map((chain) => (
                <SelectItem key={chain} value={chain}>{getChainDisplayName(chain)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t('typeFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              {(['receive', 'send', 'swap', 'transfer', 'contract'] as const).map((type) => (
                <SelectItem key={type} value={type}>{txLabels[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtersActive && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-xs text-text-muted sm:px-6 sm:text-sm">
            <span>{t('results', { count: filtered.length })}{hasMore ? ` · ${t('loadedOnly')}` : ''}</span>
            <Button variant="ghost" size="sm" onClick={() => { setChainFilter('all'); setTypeFilter('all'); setQuery(''); }}>
              {t('clearFilters')}
            </Button>
          </div>
        )}
        <div className="divide-y divide-border">
          {filtered.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-text-muted">
              {spamCount > 0 && !showSpam && !filtersActive ? t('spamHidden') : t('noMatches')}
            </p>
          )}
          {filtered.map((tx) => {
            if (!tx.tokenSymbol && (!tx.value || tx.value <= 0)) return null;

            const isOutgoing = tx.fromAddress?.toLowerCase() === normalizedSelf && tx.type !== 'receive';
            const meta = getTxStyle(tx.type, isOutgoing);
            const Icon = meta.icon;
            const label = txLabels[tx.type] ?? (isOutgoing ? txLabels.send : txLabels.receive);
            const isSwap = tx.type === 'swap';
            const isFailed = tx.status !== 'success';

            const txUrl = explorerUrl(tx.chainName, tx.hash);
            const Row = txUrl ? 'a' : 'div';
            const rowProps = txUrl
              ? { href: txUrl, target: '_blank', rel: 'noopener noreferrer' }
              : {};

            return (
              <Row
                key={tx.id}
                {...(rowProps as object)}
                className={cn(
                  'grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-2/50 sm:flex sm:gap-4 sm:px-6',
                  txUrl && 'cursor-pointer',
                  isFailed && 'opacity-60',
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.bg, meta.color)}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{label}</p>
                    {tx.tokenSymbol && (
                      <span className={cn(
                        'rounded-md px-2 py-0.5 text-sm font-medium',
                        isSwap ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-text-muted',
                      )}>
                        {tx.tokenSymbol}
                      </span>
                    )}
                    <ChainBadge chainName={tx.chainName} />
                    {tx.isSpam && <Badge variant="danger">{t('spamBadge')}</Badge>}
                    {isFailed && <Badge variant="danger">failed</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <p className="font-mono text-xs text-text-muted">
                      {shortAddress(tx.hash, 8)}
                    </p>
                    {txUrl && <ExternalLink className="h-3 w-3 shrink-0 text-text-muted opacity-50" />}
                  </div>
                </div>

                <div className="col-start-2 min-w-0 text-left sm:shrink-0 sm:text-right">
                  {tx.value !== null && tx.value > 0 ? (
                    isSwap ? (
                      /* Своп: −sentAmount [outLogo] → [inLogo] +recvAmount */
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        {tx.sentValue != null &&
                          tx.sentValue >= 0.001 &&
                          // Відсікаємо абсурдний курс (неправильні decimals від Ankr)
                          (tx.chainName === 'robinhood' || tx.value <= 0 || tx.sentValue / tx.value < 100_000) && (
                          <span className="text-sm font-semibold tabular-nums text-danger">
                            −{formatNumber(tx.sentValue, tx.sentValue < 0.01 ? 6 : tx.sentValue < 1 ? 4 : 2)}
                          </span>
                        )}
                        <TokenLogo src={tx.logoUrl} symbol={tx.swapOutSymbol ?? '?'} size={20} />
                        <span className="text-xs text-text-muted">→</span>
                        <TokenLogo src={tx.swapLogoUrl} symbol={tx.swapInSymbol ?? '?'} size={20} />
                        <span className="text-sm font-semibold tabular-nums text-primary">
                          +{formatNumber(tx.value, tx.value < 0.01 ? 6 : tx.value < 1 ? 4 : 2)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 sm:justify-end">
                        {tx.tokenSymbol && (
                          <TokenLogo src={tx.logoUrl} symbol={tx.tokenSymbol} size={20} />
                        )}
                        <span className={cn('text-sm font-semibold tabular-nums', meta.color)}>
                          {isOutgoing ? '−' : '+'}
                          {formatNumber(tx.value, tx.value < 0.01 ? 6 : tx.value < 1 ? 4 : 2)}
                        </span>
                      </div>
                    )
                  ) : null}
                  <p className="mt-1 text-sm text-text-muted">{formatDate(tx.timestamp, 'PP')}</p>
                </div>
              </Row>
            );
          })}
        </div>

        {hasMore && (
          <div className="flex justify-center border-t border-border p-4">
            <Button variant="outline" size="sm" disabled={loadingMore}
              onClick={() => void load(false)}>
              {loadingMore ? t('loadingMore') : t('loadMore')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
