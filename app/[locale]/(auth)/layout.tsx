import Image from 'next/image';
import { getLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { redirect, Link } from '@/i18n/navigation';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.id) {
    const locale = await getLocale();
    redirect({ href: '/dashboard', locale });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Image
          src="/logo.png"
          alt="CryptoPortfolio"
          width={32}
          height={32}
          className="rounded-lg object-cover"
        />
        <span className="font-semibold tracking-tight">
          Crypto<span className="gradient-text">Portfolio</span>
        </span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
