"use client";

import { cn } from "@/lib/utils/cn";
import { useAlertsUnread } from "@/lib/alerts/unread";

/** Red dot next to links to the alerts page while an alert has not been seen yet. */
export function AlertsNewDot({ className }: { className?: string }) {
  const unread = useAlertsUnread();
  if (!unread) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full bg-danger", className)}
    />
  );
}
