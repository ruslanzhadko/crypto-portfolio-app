const TELEGRAM_HOSTS = new Set(["t.me", "www.t.me", "telegram.me", "www.telegram.me"]);

export function parseTelegramUsername(value: string): string | null {
  let candidate = value.trim();
  if (!candidate) return null;

  if (/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i.test(candidate)) {
    try {
      const normalizedUrl = /^https?:\/\//i.test(candidate)
        ? candidate
        : `https://${candidate}`;
      const url = new URL(normalizedUrl);
      if (!TELEGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }

  candidate = candidate.replace(/^@/, "").trim().toLowerCase();
  return /^[a-z][a-z0-9_]{3,31}$/.test(candidate) ? candidate : null;
}
