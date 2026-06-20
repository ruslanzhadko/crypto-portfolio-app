import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { UsersTable } from '@/components/admin/users-table';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin">
          <ChevronLeft className="h-4 w-4" />
          До адмін-панелі
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Користувачі</h1>
        <p className="text-sm text-text-muted">
          Перегляд та управління акаунтами.
        </p>
      </div>

      <UsersTable />
    </div>
  );
}
