"use client";

import { useEffect, useState } from "react";
import { CHANGELOG } from "./entries";

const STORAGE_KEY = "changelog-seen";
const SEEN_EVENT = "changelog-seen";

/** Identifies the newest entry; a new entry (or a new date) makes the dot reappear. */
export const LATEST_CHANGELOG_ID = (() => {
  const latest = CHANGELOG[0];
  return latest ? `${latest.date}:${latest.title.en}` : "";
})();

function readSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, LATEST_CHANGELOG_ID);
  } catch {
    // Storage may be unavailable (private mode); the dot then simply stays.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** True while the newest changelog entry has not been opened in this browser. */
export function useChangelogUnread(): boolean {
  // Starts hidden so server and client render the same markup; storage is read after mount.
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const update = () =>
      setUnread(!!LATEST_CHANGELOG_ID && readSeen() !== LATEST_CHANGELOG_ID);
    update();
    window.addEventListener(SEEN_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SEEN_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return unread;
}
