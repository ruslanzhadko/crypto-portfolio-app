import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowLeft, Wallet, Bell, Newspaper, ShieldCheck } from 'lucide-react';
import { auth } from '@/lib/auth';
import { redirect, Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/common/locale-switcher';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.id && !session.user.isBlocked && !session.user.sessionExpired) {
    const locale = await getLocale();
    redirect({ href: '/dashboard', locale });
  }
  const t = await getTranslations('Auth');
  return (
    <div className="min-h-screen bg-background text-text selection:bg-primary/30">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Image
            src="/logo2.png"
            alt=""
            width={36}
            height={36}
            className="rounded-lg object-cover"
          />
          <span className="font-semibold tracking-tight">CryptoPortfolio</span>
        </Link>
        <LocaleSwitcher />
      </header>
      <main className="mx-auto grid min-h-[calc(100svh-88px)] max-w-7xl items-center gap-12 px-6 pb-10 pt-6 sm:px-10 lg:grid-cols-2 lg:gap-24 lg:py-12">
        <section className="hidden lg:block">
          <h1 className="whitespace-pre-line text-5xl font-semibold leading-[1.15] tracking-tight xl:text-6xl">
            {t('brandTitle')}
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-text-muted">
            {t('brandDescription')}
          </p>
          <ul className="mt-10 space-y-5 text-sm">
            {(
              [
                { icon: Wallet, key: 'featureWallets' },
                { icon: Bell, key: 'featureAlerts' },
                { icon: Newspaper, key: 'featureFeed' },
              ] as const
            ).map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-4">
                <Icon aria-hidden className="h-5 w-5 text-primary" />
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-12 flex max-w-md items-start gap-3 border-t border-border pt-6 text-sm leading-6 text-text-muted">
            <ShieldCheck aria-hidden className="mt-1 h-5 w-5 shrink-0" />
            <p>{t('readOnly')}</p>
          </div>
        </section>
        <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-9">
          {children}
          <Link
            href="/"
            className="mt-8 flex items-center justify-center gap-2 rounded text-xs text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            {t('backHome')}
          </Link>
        </section>
      </main>
    </div>
  );
}
