import { getLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { redirect } from '@/i18n/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Navbar } from '@/components/layout/navbar';
import { MobileNav } from '@/components/layout/mobile-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale();
    redirect({ href: '/auth/login', locale });
  }
  if (session!.user.isBlocked) {
    const locale = await getLocale();
    redirect({ href: '/auth/error?error=AccessDenied', locale });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userRole={session!.user.role} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Navbar
          email={session!.user.email ?? ''}
          name={session!.user.name}
          role={session!.user.role}
        />
        <main className="flex-1 px-3 pb-20 pt-4 sm:px-4 sm:pt-6 md:px-8 md:pb-8">
          {children}
        </main>
      </div>
      <MobileNav userRole={session!.user.role} />
    </div>
  );
}
