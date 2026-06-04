'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, FileText, ExternalLink } from 'lucide-react';
import { ChainBadge } from '@/components/common/network-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatNumber, shortAddress } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { TokenLogo } from '@/components/common/token-logo';
import { cn } from '@/lib/utils/cn';

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
}

interface TransactionListProps {
  walletId: string;
  walletAddress: string;
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
};

function explorerUrl(chainName: string, hash: string): string | null {
  const base = EXPLORER[chainName];
  return base ? `${base}${hash}` : null;
}

const TX_META: Record<string, { label: string; icon: typeof ArrowDownLeft; color: string; bg: string }> = {
  receive:  { label: 'Отримання',    icon: ArrowDownLeft,  color: 'text-success',    bg: 'bg-success/10'  },
  send:     { label: 'Відправлення', icon: ArrowUpRight,   color: 'text-danger',     bg: 'bg-danger/10'   },
  swap:     { label: 'Своп',         icon: ArrowLeftRight, color: 'text-primary',    bg: 'bg-primary/10'  },
  transfer: { label: 'Переказ',      icon: ArrowDownLeft,  color: 'text-success',    bg: 'bg-success/10'  },
  contract: { label: 'Контракт',     icon: FileText,       color: 'text-text-muted', bg: 'bg-surface-2'   },
};

function getTxMeta(type: string, isOutgoing: boolean) {
  return TX_META[type] ?? (isOutgoing ? TX_META.send! : TX_META.receive!);
}

export function TransactionList({ walletId, walletAddress }: TransactionListProps) {
  const [items, setItems] = useState<TransactionDTO[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Масив page-токенів: [undefined, "tok1", "tok2", ...] — undefined = перша сторінка
  const pageTokensRef = useRef<(string | undefined)[]>([undefined]);
  const [pageIdx, setPageIdx] = useState(0);

  const load = useCallback(async (idx: number) => {
    setError(null);
    setItems(null);
    const token = pageTokensRef.current[idx];
    const url = `/api/wallets/${walletId}/transactions?pageSize=20${token ? `&pageToken=${token}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      setError('Не вдалось завантажити транзакції');
      return;
    }
    const payload = (await res.json()) as {
      transactions: TransactionDTO[];
      nextPageToken?: string;
      hasMore: boolean;
    };
    if (!payload?.transactions) { setError('Помилка відповіді'); return; }

    setItems(payload.transactions);
    setHasMore(payload.hasMore ?? false);

    if (payload.nextPageToken && !pageTokensRef.current[idx + 1]) {
      pageTokensRef.current[idx + 1] = payload.nextPageToken;
    }
  }, [walletId]);

  useEffect(() => { void load(pageIdx); }, [load, pageIdx]);

  // Рефетч після wallet sync
  useEffect(() => {
    const handler = (e: Event) => {
      const { walletId: sid } = (e as CustomEvent<{ walletId: string }>).detail;
      if (sid !== walletId) return;
      // Скидаємо на першу сторінку
      pageTokensRef.current = [undefined];
      setPageIdx(0);
      void load(0);
    };
    window.addEventListener('wallet-synced', handler);
    return () => window.removeEventListener('wallet-synced', handler);
  }, [walletId, load]);

  const normalizedSelf = walletAddress.toLowerCase();

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-danger">{error}</CardContent>
      </Card>
    );
  }

  if (items === null) {
    return (
      <Card>
        <CardHeader><CardTitle>Транзакції</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const visible = items.filter(
    (tx) => tx.tokenSymbol || (tx.value !== null && tx.value > 0),
  );

  if (visible.length === 0 && pageIdx === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Транзакції відсутні"
        description="Можливо, у цьому гаманці ще не було активності або токенів на балансі."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Транзакції</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {visible.map((tx) => {
            if (!tx.tokenSymbol && (!tx.value || tx.value <= 0)) return null;

            const isOutgoing = tx.fromAddress?.toLowerCase() === normalizedSelf && tx.type !== 'receive';
            const meta = getTxMeta(tx.type, isOutgoing);
            const Icon = meta.icon;
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
                  'flex items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-2/50',
                  txUrl && 'cursor-pointer',
                  isFailed && 'opacity-60',
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.bg, meta.color)}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{meta.label}</p>
                    {tx.tokenSymbol && (
                      <span className={cn(
                        'rounded-md px-2 py-0.5 text-sm font-medium',
                        isSwap ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-text-muted',
                      )}>
                        {tx.tokenSymbol}
                      </span>
                    )}
                    <ChainBadge chainName={tx.chainName} />
                    {isFailed && <Badge variant="danger">failed</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <p className="font-mono text-xs text-text-muted">
                      {shortAddress(tx.hash, 8)}
                    </p>
                    {txUrl && <ExternalLink className="h-3 w-3 shrink-0 text-text-muted opacity-50" />}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {tx.value !== null && tx.value > 0 ? (
                    isSwap ? (
                      /* Своп: −sentAmount [outLogo] → [inLogo] +recvAmount */
                      <div className="flex items-center justify-end gap-1.5">
                        {tx.sentValue != null &&
                          tx.sentValue >= 0.001 &&
                          // Відсікаємо абсурдний курс (неправильні decimals від Ankr)
                          (tx.value == null || tx.value <= 0 || tx.sentValue / tx.value < 100_000) && (
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
                      <div className="flex items-center justify-end gap-2">
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

        {(pageIdx > 0 || hasMore) && (
          <div className="flex items-center justify-between border-t border-border p-4">
            <Button variant="outline" size="sm" disabled={pageIdx === 0}
              onClick={() => setPageIdx((p) => Math.max(0, p - 1))}>
              Попередня
            </Button>
            <span className="text-xs text-text-muted">Стор. {pageIdx + 1}</span>
            <Button variant="outline" size="sm" disabled={!hasMore}
              onClick={() => setPageIdx((p) => p + 1)}>
              Наступна
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
