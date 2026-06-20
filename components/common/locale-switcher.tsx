'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
  { code: 'ru', label: 'Русский' },
] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(next: string) {
    // pathname is e.g. /uk/dashboard or /dashboard (en, as-needed prefix)
    // Strip existing locale prefix if any
    const withoutLocale = pathname.replace(/^\/(uk|ru)(\/|$)/, '/');
    const newPath = next === 'en' ? withoutLocale : `/${next}${withoutLocale}`;
    router.push(newPath);
    router.refresh();
  }

  const current = LOCALES.find((l) => l.code === locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{current?.label ?? locale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => switchLocale(l.code)}
            className={l.code === locale ? 'text-primary' : ''}
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
