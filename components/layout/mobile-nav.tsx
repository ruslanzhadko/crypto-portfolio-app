'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { NAV_ITEMS } from './nav-items';

export function MobileNav({ userRole }: { userRole: Role }) {
  const pathname = usePathname();
  const t = useTranslations('Nav');
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || userRole === 'ADMIN').slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 grid border-t border-border bg-surface/95 backdrop-blur md:hidden"
         style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-2 text-[11px]',
              active ? 'text-primary' : 'text-text-muted',
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate">{t(item.labelKey as 'dashboard')}</span>
          </Link>
        );
      })}
    </nav>
  );
}
