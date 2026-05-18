import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Bell,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/wallets', label: 'Гаманці', icon: Wallet },
  { href: '/market', label: 'Market', icon: TrendingUp },
  { href: '/alerts', label: 'Сповіщення', icon: Bell },
  { href: '/settings', label: 'Налаштування', icon: Settings },
  { href: '/admin', label: 'Адмін', icon: ShieldCheck, adminOnly: true },
];
