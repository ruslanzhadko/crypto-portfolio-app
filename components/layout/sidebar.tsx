'use client';

import Image from 'next/image';
import { usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { NAV_ITEMS } from './nav-items';

interface SidebarProps {
  userRole: Role;
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('Nav');
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || userRole === 'ADMIN');

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface/50 backdrop-blur md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
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
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(item.labelKey as 'dashboard')}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4 text-xs text-text-muted">
        <p>© {new Date().getFullYear()} CryptoPortfolio</p>
        <p className="mt-0.5">
          {t('footerBy')}{' '}
          <a
            href="https://t.me/ludoslan"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            @ludoslan
          </a>
        </p>
      </div>
    </aside>
  );
}
