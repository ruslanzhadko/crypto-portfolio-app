"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS } from "./nav-items";
import { MoreHorizontal } from "lucide-react";
import { ChangelogNewDot } from "@/components/changelog/new-dot";
import { AlertsNewDot } from "@/components/alerts/new-dot";
import { useChangelogUnread } from "@/lib/changelog/unread";
import { useAlertsUnread } from "@/lib/alerts/unread";
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
  const changelogUnread = useChangelogUnread();
  const alertsUnread = useAlertsUnread();
  const available = NAV_ITEMS.filter(
    (i) =>
      (!i.adminOnly || userRole === "ADMIN") &&
      (!i.exchangesOnly || exchangesEnabled),
  );
  const primary = exchangesEnabled
    ? ["/dashboard", "/wallets", "/exchanges", "/positions"]
    : available.slice(0, 4).map((i) => i.href);
  const items = primary.map((href) => available.find((i) => i.href === href)!);
  // Everything that does not fit the bar (settings, changelog, ...) lives in the "More" sheet.
  const moreItems = available.filter((i) => !primary.includes(i.href));

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Keep fixed navigation outside page containers and avoid backdrop filtering
  // during Safari's browser-toolbar/viewport changes while scrolling.
  return createPortal(
    <nav
      // Own GPU layer: iOS Safari otherwise sometimes paints the bar mid-screen during momentum scrolling.
      className="fixed bottom-0 left-0 right-0 z-40 grid transform-gpu border-t border-border bg-surface [backface-visibility:hidden] md:hidden"
      style={{
        gridTemplateColumns: "repeat(5, minmax(0,1fr))",
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
            <span className="relative">
              <Icon className="h-5 w-5" />
              {item.href === "/alerts" && <AlertsNewDot className="absolute -right-1 -top-0.5" />}
            </span>
            <span
              className="block w-full truncate text-center"
              aria-hidden="true"
            >
              {t(mobileLabelKey as "dashboard")}
            </span>
          </Link>
        );
      })}
      {moreItems.length > 0 && (
        <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
          <DialogTrigger className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[11px] font-medium text-text-muted">
            <span className="relative">
              <MoreHorizontal className="h-5 w-5" />
              {/* Something new behind "More": the changelog, or alerts when they live in the sheet. */}
              {(changelogUnread ||
                (alertsUnread && moreItems.some((i) => i.href === "/alerts"))) && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-danger"
                />
              )}
            </span>
            <span>{t("more")}</span>
          </DialogTrigger>
          {/* A rounded sheet that grows out of the "More" tab, just above the bottom bar. */}
          {/* No auto-focus on open: a focus ring around the close button looks like a stray box on phones. */}
          <DialogContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 top-auto w-auto max-w-none translate-x-0 translate-y-0 gap-3 rounded-3xl p-4 pt-5 origin-bottom-right duration-300 ease-out data-[state=closed]:duration-150 data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:zoom-in-90"
          >
            <DialogTitle className="px-2 text-base">{t("more")}</DialogTitle>
            <div className="grid gap-1">
              {moreItems.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  // Items follow the sheet one after another.
                  style={{ animationDelay: `${60 + index * 35}ms` }}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors fill-mode-both animate-in fade-in-0 slide-in-from-bottom-2 duration-300 hover:bg-surface-2 active:bg-surface-2 motion-reduce:animate-none"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-text-muted">
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  {t(item.labelKey)}
                  {item.href === "/changelog" && <ChangelogNewDot />}
                  {item.href === "/alerts" && <AlertsNewDot />}
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
