"use client";

import { useEffect } from "react";
import { markChangelogSeen } from "@/lib/changelog/unread";

/** Rendered on the changelog page: opening it clears the "new" dot. */
export function ChangelogSeenMarker() {
  useEffect(() => {
    markChangelogSeen();
  }, []);
  return null;
}
