'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import type { NotificationLog as NotificationLogModel, TriggerType, TriggerDirection } from '@prisma/client';

type LogWithTrigger = NotificationLogModel & {
  trigger: { triggerType: TriggerType; direction: TriggerDirection } | null;
};
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { PriceChange } from '@/components/common/price-change';
import { formatRelative, formatUsd } from '@/lib/utils/format';

function PriceTargetBadge({ direction }: { direction: TriggerDirection }) {
  if (direction === 'UP')
    return <span className="text-xs font-medium text-success">↑ Ціль досягнута</span>;
  if (direction === 'DOWN')
    return <span className="text-xs font-medium text-danger">↓ Ціль досягнута</span>;
  return <span className="text-xs font-medium text-text-muted">◎ Ціль досягнута</span>;
}

export function NotificationLog() {
  const [items, setItems] = useState<LogWithTrigger[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/alerts/logs?page=${page}&pageSize=20`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      logs: LogWithTrigger[];
      pagination: { total: number; totalPages: number };
    };
    setItems(data.logs);
    setTotal(data.pagination.total);
    setTotalPages(data.pagination.totalPages);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (items === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Журнал сповіщень</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Журнал сповіщень</CardTitle>
        {total > 0 && <span className="text-xs text-text-muted">{total} всього</span>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Bell}
              title="Поки що жодного сповіщення"
              description="Створіть тригер, щоб отримувати повідомлення про цінові аномалії в Telegram."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((log) => (
              <div key={log.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{log.tokenSymbol}</span>
                    {log.status !== 'sent' && (
                      <Badge variant="danger" className="text-[10px]">
                        {log.status}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-text-muted">{log.message}</p>
                </div>
                <div className="text-right">
                  {log.trigger?.triggerType === 'PRICE_TARGET' ? (
                    <PriceTargetBadge direction={log.trigger.direction} />
                  ) : (
                    <PriceChange value={log.deltaPercent} size="sm" />
                  )}
                  <p className="text-xs text-text-muted">{formatUsd(log.price)}</p>
                  <p className="text-[10px] text-text-muted">{formatRelative(log.sentAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 && (
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
      </CardContent>
    </Card>
  );
}
