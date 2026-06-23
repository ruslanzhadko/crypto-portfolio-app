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
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/wallets', labelKey: 'wallets', icon: Wallet },
  { href: '/market', labelKey: 'market', icon: TrendingUp },
  { href: '/alerts', labelKey: 'alerts', icon: Bell },
  { href: '/settings', labelKey: 'settings', icon: Settings },
  { href: '/admin', labelKey: 'admin', icon: ShieldCheck, adminOnly: true },
];
