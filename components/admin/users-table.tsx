'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Loader2, Search, ShieldOff, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatRelative } from '@/lib/utils/format';

interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  isBlocked: boolean;
  telegramChatId: string | null;
  createdAt: string;
  _count: { wallets: number; triggers: number };
}

export function UsersTable() {
  const [users, setUsers] = useState<UserDTO[] | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        users: UserDTO[];
        pagination: { totalPages: number };
      };
      setUsers(data.users);
      setTotalPages(data.pagination.totalPages);
    } catch {
      setUsers([]);
      setTotalPages(0);
    }
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function patch(userId: string, body: Record<string, unknown>, successMsg: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast({
          variant: 'destructive',
          title: 'Помилка',
          description: data?.error?.message ?? 'Щось пішло не так',
        });
        return false;
      }
      toast({ title: successMsg });
      return true;
    } catch {
      toast({ variant: 'destructive', title: 'Помилка мережі', description: 'Спробуйте ще раз.' });
      return false;
    }
  }

  function onToggleBlock(user: UserDTO) {
    startTransition(async () => {
      const ok = await patch(
        user.id,
        { isBlocked: !user.isBlocked },
        user.isBlocked ? 'Акаунт розблоковано' : 'Акаунт заблоковано',
      );
      if (ok) void load();
    });
  }

  function onToggleRole(user: UserDTO) {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    if (
      !confirm(
        `${newRole === 'ADMIN' ? 'Підвищити' : 'Понизити'} ${user.email} до ролі ${newRole}?`,
      )
    )
      return;
    startTransition(async () => {
      const ok = await patch(
        user.id,
        { role: newRole },
        `Роль змінено на ${newRole}`,
      );
      if (ok) void load();
    });
  }

  function onDelete(user: UserDTO) {
    if (
      !confirm(`Видалити ${user.email}? Усі дані буде видалено каскадно.`)
    )
      return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Не вдалось видалити' });
        return;
      }
      toast({ title: 'Користувача видалено' });
      void load();
    });
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Пошук за email або імʼям..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {users === null ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="p-6 text-sm text-text-muted">Користувачів не знайдено.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">Імʼя</th>
                    <th className="px-4 py-3 text-left">Роль</th>
                    <th className="hidden px-4 py-3 text-center md:table-cell">Гаманці</th>
                    <th className="hidden px-4 py-3 text-center md:table-cell">Тригери</th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">Реєстрація</th>
                    <th className="px-4 py-3 text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-b border-border/60 transition-colors hover:bg-surface-2/50 ${u.isBlocked ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {u.name ?? <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                            {u.role}
                          </Badge>
                          {u.isBlocked && (
                            <Badge variant="danger">Blocked</Badge>
                          )}
                          {u.telegramChatId && (
                            <Badge variant="success">TG</Badge>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-center md:table-cell">
                        {u._count.wallets}
                      </td>
                      <td className="hidden px-4 py-3 text-center md:table-cell">
                        {u._count.triggers}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-text-muted lg:table-cell">
                        {formatRelative(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={u.role === 'ADMIN' ? 'Понизити до USER' : 'Підвищити до ADMIN'}
                            aria-label={u.role === 'ADMIN' ? 'Понизити до USER' : 'Підвищити до ADMIN'}
                            onClick={() => onToggleRole(u)}
                            disabled={isPending}
                          >
                            <UserCog className="h-4 w-4 text-text-muted" />
                          </Button>
                          {u.role !== 'ADMIN' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={u.isBlocked ? 'Розблокувати' : 'Заблокувати'}
                                onClick={() => onToggleBlock(u)}
                                disabled={isPending}
                              >
                                {u.isBlocked ? (
                                  <ShieldCheck className="h-4 w-4 text-success" />
                                ) : (
                                  <ShieldOff className="h-4 w-4 text-warning" />
                                )}
                                <span className="hidden md:inline">
                                  {u.isBlocked ? 'Розблокувати' : 'Заблокувати'}
                                </span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Видалити користувача"
                                onClick={() => onDelete(u)}
                                disabled={isPending}
                                className="text-danger hover:text-danger"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
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
            disabled={page <= 1 || isPending}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Попередня
          </Button>
          <span className="text-xs text-text-muted">
            Стор. {page} з {totalPages}
            {isPending && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Наступна
          </Button>
        </div>
      )}
    </div>
  );
}
