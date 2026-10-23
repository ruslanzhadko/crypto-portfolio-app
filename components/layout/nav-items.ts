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
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  exchangesOnly?: boolean;
  /** Left out of the desktop sidebar (reachable from its footer instead). */
  hideInSidebar?: boolean;
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
  {
    href: "/changelog",
    labelKey: "changelog",
    icon: Sparkles,
    hideInSidebar: true,
  },
  { href: "/admin", labelKey: "admin", icon: ShieldCheck, adminOnly: true },
];
