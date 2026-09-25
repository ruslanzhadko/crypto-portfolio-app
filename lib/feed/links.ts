export interface FeedTextLink {
  offset: number;
  length: number;
  url: string;
}

type TelegramEntity = {
  className?: unknown;
  offset?: unknown;
  length?: unknown;
  url?: unknown;
};

const URL_PATTERN = /(?:https?:\/\/|www\.|t\.me\/)[^\s<>{}\[\]]+/gi;
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/;

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim().replace(TRAILING_URL_PUNCTUATION, "");
  if (!trimmed) return null;

  const candidate = /^(?:www\.|t\.me\/)/i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function isValidRange(
  text: string,
  offset: unknown,
  length: unknown,
): offset is number {
  return (
    Number.isInteger(offset) &&
    Number.isInteger(length) &&
    offset >= 0 &&
    length > 0 &&
    offset + length <= text.length
  );
}

function uniqueLinks(links: FeedTextLink[]): FeedTextLink[] {
  const used = new Set<string>();
  return links
    .sort(
      (left, right) => left.offset - right.offset || right.length - left.length,
    )
    .filter((link) => {
      const key = `${link.offset}:${link.length}:${link.url}`;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });
}

export function findTextUrls(text: string): FeedTextLink[] {
  const links: FeedTextLink[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const value = match[0];
    const offset = match.index;
    if (offset == null) continue;
    const url = normalizeUrl(value);
    if (!url) continue;
    links.push({
      offset,
      length: value.replace(TRAILING_URL_PUNCTUATION, "").length,
      url,
    });
  }
  return links;
}

export function extractTelegramLinks(
  text: string,
  entities: readonly TelegramEntity[] | undefined,
): FeedTextLink[] {
  const links = findTextUrls(text);

  for (const entity of entities ?? []) {
    if (!isValidRange(text, entity.offset, entity.length)) continue;
    const label = text.slice(entity.offset, entity.offset + entity.length);
    const url =
      entity.className === "MessageEntityTextUrl" &&
      typeof entity.url === "string"
        ? normalizeUrl(entity.url)
        : entity.className === "MessageEntityUrl"
          ? normalizeUrl(label)
          : null;
    if (url) links.push({ offset: entity.offset, length: entity.length, url });
  }

  return uniqueLinks(links);
}

export function readFeedTextLinks(metadata: unknown): FeedTextLink[] {
  if (!metadata || typeof metadata !== "object" || !("links" in metadata)) {
    return [];
  }

  const links = (metadata as { links?: unknown }).links;
  if (!Array.isArray(links)) return [];

  return links.flatMap((link) => {
    if (!link || typeof link !== "object") return [];
    const candidate = link as Partial<FeedTextLink>;
    if (
      !Number.isInteger(candidate.offset) ||
      !Number.isInteger(candidate.length) ||
      candidate.offset < 0 ||
      candidate.length <= 0 ||
      typeof candidate.url !== "string"
    ) {
      return [];
    }
    const url = normalizeUrl(candidate.url);
    return url
      ? [{ offset: candidate.offset, length: candidate.length, url }]
      : [];
  });
}

export function resolveFeedTextLinks(
  text: string,
  storedLinks: FeedTextLink[] = [],
): FeedTextLink[] {
  const validStored = storedLinks.filter((link) =>
    isValidRange(text, link.offset, link.length),
  );
  return uniqueLinks([...validStored, ...findTextUrls(text)]);
}
