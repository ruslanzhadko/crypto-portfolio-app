'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
          <Wallet className="h-4 w-4 text-white" />
        </div>
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
        © {new Date().getFullYear()} CryptoPortfolio
      </div>
    </aside>
  );
}
