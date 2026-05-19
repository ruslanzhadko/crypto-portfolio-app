'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PriceChange } from '@/components/common/price-change';
import { formatRelative, formatUsd } from '@/lib/utils/format';

interface LogDTO {
  id: string;
  tokenSymbol: string;
  message: string;
  deltaPercent: number;
  price: number;
  status: string;
  sentAt: string;
  user: { email: string; name: string | null };
}

type StatusFilter = 'all' | 'sent' | 'failed';

export function AdminLogsTable() {
  const [items, setItems] = useState<LogDTO[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status !== 'all') params.set('status', status);
    const res = await fetch(`/api/admin/logs?${params.toString()}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      logs: LogDTO[];
      pagination: { total: number; totalPages: number };
    };
    setItems(data.logs);
    setTotal(data.pagination.total);
    setTotalPages(data.pagination.totalPages);
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: 'Всі', value: 'all' },
    { label: 'Успішні', value: 'sent' },
    { label: 'Невдалі', value: 'failed' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {filterButtons.map((f) => (
          <Button
            key={f.value}
            variant={status === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-xs text-text-muted">{total} записів</span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {items === null ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-text-muted">
              <Bell className="h-8 w-8 opacity-40" />
              <p className="text-sm">Сповіщень не знайдено</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Токен</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">Користувач</th>
                    <th className="px-4 py-3 text-right">Δ%</th>
                    <th className="hidden px-4 py-3 text-right md:table-cell">Ціна</th>
                    <th className="px-4 py-3 text-left">Статус</th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">Повідомлення</th>
                    <th className="px-4 py-3 text-right">Час</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-border/60 transition-colors hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3 font-medium">{log.tokenSymbol}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <p className="font-mono text-xs">{log.user.email}</p>
                        {log.user.name && (
                          <p className="text-xs text-text-muted">{log.user.name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PriceChange value={log.deltaPercent} size="sm" />
                      </td>
                      <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                        {formatUsd(log.price)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={log.status === 'sent' ? 'success' : 'danger'}>
                          {log.status === 'sent' ? 'Надіслано' : 'Помилка'}
                        </Badge>
                      </td>
                      <td className="hidden max-w-[200px] px-4 py-3 lg:table-cell">
                        <p className="truncate text-xs text-text-muted">{log.message}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-text-muted">
                        {formatRelative(log.sentAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Попередня
          </Button>
          <span className="text-xs text-text-muted">
            Стор. {page} з {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Наступна
          </Button>
        </div>
      )}
    </div>
  );
}
