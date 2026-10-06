"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS } from "./nav-items";
import { Coins, MoreHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MobileNav({
  userRole,
  exchangesEnabled = false,
}: {
  userRole: Role;
  exchangesEnabled?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("Nav");
  const available = NAV_ITEMS.filter(
    (i) =>
      (!i.adminOnly || userRole === "ADMIN") &&
      (!i.exchangesOnly || exchangesEnabled),
  );
  const items = exchangesEnabled
    ? [
        available.find((i) => i.href === "/dashboard")!,
        { href: "/dashboard#assets", labelKey: "assets", icon: Coins },
        available.find((i) => i.href === "/exchanges")!,
        available.find((i) => i.href === "/positions")!,
      ]
    : available.slice(0, 5);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Keep fixed navigation outside page containers and avoid backdrop filtering
  // during Safari's browser-toolbar/viewport changes while scrolling.
  return createPortal(
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 grid border-t border-border bg-surface md:hidden"
      style={{
        gridTemplateColumns: `repeat(${exchangesEnabled ? 5 : items.length}, minmax(0,1fr))`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const label = t(item.labelKey as "dashboard");
        const mobileLabelKey =
          item.labelKey === "alerts"
            ? "alertsMobile"
            : item.labelKey === "settings"
              ? "settingsMobile"
              : item.labelKey;
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={label}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[11px] font-medium",
              active ? "text-primary" : "text-text-muted",
            )}
          >
            <Icon className="h-5 w-5" />
            <span
              className="block w-full truncate text-center"
              aria-hidden="true"
            >
              {t(mobileLabelKey as "dashboard")}
            </span>
          </Link>
        );
      })}
      {exchangesEnabled && (
        <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
          <DialogTrigger className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[11px] font-medium text-text-muted">
            <MoreHorizontal className="h-5 w-5" />
            <span>{t("more")}</span>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>{t("more")}</DialogTitle>
            <div className="grid gap-1">
              {available
                .filter(
                  (i) =>
                    !["/dashboard", "/exchanges", "/positions"].includes(
                      i.href,
                    ),
                )
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-lg p-3 hover:bg-surface-2"
                  >
                    <item.icon className="h-5 w-5" />
                    {t(item.labelKey)}
                  </Link>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </nav>,
    document.body,
  );
}
