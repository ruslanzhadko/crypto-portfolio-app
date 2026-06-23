'use client';

import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { LogOut, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Role } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/common/locale-switcher';

interface NavbarProps {
  email: string;
  name?: string | null;
  role: Role;
}

export function Navbar({ email, name, role }: NavbarProps) {
  const t = useTranslations('Nav');
  const locale = useLocale();
  const initials = (name || email || 'U').charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <Image
          src="/logo2.png"
          alt="CryptoPortfolio"
          width={34}
          height={34}
          className="rounded-lg object-cover"
        />
        <span className="text-lg font-semibold tracking-tight">
          Crypto<span className="gradient-text">Portfolio</span>
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <LocaleSwitcher />
        {role === 'ADMIN' && <Badge variant="outline">{t('adminBadge')}</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-primary text-xs text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{name ?? t('defaultUser')}</span>
                <span className="text-xs text-text-muted">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" /> {t('profile')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: `/${locale}/auth/login` })}
              className="flex items-center gap-2 text-danger focus:text-danger"
            >
              <LogOut className="h-4 w-4" /> {t('signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
