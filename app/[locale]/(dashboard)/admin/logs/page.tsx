import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { AdminLogsTable } from '@/components/admin/admin-logs-table';

export const dynamic = 'force-dynamic';

export default async function AdminLogsPage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    const locale = await getLocale();
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('AdminLogs');

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin">
          <ChevronLeft className="h-4 w-4" />
          {t('backLink')}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('pageTitle')}</h1>
        <p className="text-sm text-text-muted">{t('pageDescription')}</p>
      </div>

      <AdminLogsTable />
    </div>
  );
}
