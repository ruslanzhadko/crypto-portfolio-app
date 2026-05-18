import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
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
    redirect('/auth/login');
  }
  if (session.user.isBlocked) {
    redirect('/auth/error?error=AccessDenied');
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userRole={session.user.role} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Navbar
          email={session.user.email ?? ''}
          name={session.user.name}
          role={session.user.role}
        />
        <main className="flex-1 px-4 pb-20 pt-6 md:px-8 md:pb-8">
          {children}
        </main>
      </div>
      <MobileNav userRole={session.user.role} />
    </div>
  );
}
