import { Wallet } from 'lucide-react';
import { getLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { redirect, Link } from '@/i18n/navigation';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user) {
    const locale = await getLocale();
    redirect({ href: '/dashboard', locale });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
          <Wallet className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold tracking-tight">
          Crypto<span className="gradient-text">Portfolio</span>
        </span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
