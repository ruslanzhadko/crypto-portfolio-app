"use client";

import { cn } from "@/lib/utils/cn";
import { useChangelogUnread } from "@/lib/changelog/unread";

/** Small red dot shown next to links to the changelog while there is something new. */
export function ChangelogNewDot({ className }: { className?: string }) {
  const unread = useChangelogUnread();
  if (!unread) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full bg-danger", className)}
    />
  );
}
