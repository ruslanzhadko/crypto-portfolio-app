'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileText } from 'lucide-react';
import { ChainBadge } from '@/components/common/network-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatNumber, shortAddress } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';

interface TransactionDTO {
  id: string;
  hash: string;
  chainName: string;
  type: string;
  tokenSymbol: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  value: number | null;
  status: string;
  timestamp: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface TransactionListProps {
  walletId: string;
  walletAddress: string;
}

export function TransactionList({ walletId, walletAddress }: TransactionListProps) {
  const [items, setItems] = useState<TransactionDTO[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/wallets/${walletId}/transactions?page=${page}&pageSize=20`);
    if (!res.ok) {
      setError('Не вдалось завантажити транзакції');
      return;
    }
    const data = (await res.json()) as {
      transactions: TransactionDTO[];
      pagination: Pagination;
    };
    setItems(data.transactions);
    setPagination(data.pagination);
  }, [walletId, page]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <CardHeader>
          <CardTitle>Транзакції</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Транзакції відсутні"
        description="Можливо, у цьому гаманці ще не було активності або потрібно зробити Sync."
      />
    );
  }

  const normalizedSelf = walletAddress.toLowerCase();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Транзакції</CardTitle>
        {pagination && (
          <span className="text-xs text-text-muted">
            {pagination.total} всього
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {items.map((tx) => {
            const isOutgoing =
              tx.fromAddress?.toLowerCase() === normalizedSelf;
            const Icon = isOutgoing ? ArrowUpRight : ArrowDownLeft;
            const color = isOutgoing ? 'text-danger' : 'text-success';
            return (
              <div
                key={tx.id}
                className="flex items-center gap-4 px-6 py-3 text-sm transition-colors hover:bg-surface-2/50"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize">{tx.type}</p>
                    {tx.chainName && <ChainBadge chainName={tx.chainName} />}
                  </div>
                  <p className="font-mono text-xs text-text-muted">
                    {shortAddress(tx.hash, 8)}
                  </p>
                </div>
                <div className="text-right">
                  {tx.value !== null && (
                    <p className="font-medium">
                      {isOutgoing ? '-' : '+'}
                      {formatNumber(tx.value, 6)} {tx.tokenSymbol ?? ''}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2 text-xs text-text-muted">
                    <span>{formatDate(tx.timestamp, 'PP')}</span>
                    {tx.status !== 'success' && (
                      <Badge variant="danger">{tx.status}</Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Попередня
            </Button>
            <span className="text-xs text-text-muted">
              Стор. {pagination.page} з {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              Наступна
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
