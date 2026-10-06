import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Radio,
  Bell,
  Settings,
  ShieldCheck,
  Building2,
  Activity,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  exchangesOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/wallets", labelKey: "wallets", icon: Wallet },
  {
    href: "/exchanges",
    labelKey: "exchanges",
    icon: Building2,
    exchangesOnly: true,
  },
  {
    href: "/positions",
    labelKey: "positions",
    icon: Activity,
    exchangesOnly: true,
  },
  { href: "/market", labelKey: "market", icon: TrendingUp },
  { href: "/feed", labelKey: "feed", icon: Radio },
  { href: "/alerts", labelKey: "alerts", icon: Bell },
  { href: "/settings", labelKey: "settings", icon: Settings },
  { href: "/admin", labelKey: "admin", icon: ShieldCheck, adminOnly: true },
];
