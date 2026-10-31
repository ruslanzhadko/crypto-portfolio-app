import { getCache } from "@vercel/functions";

/**
 * One-off requests from the bot's /positions to the exchange worker, through the Vercel Runtime
 * Cache (never PostgreSQL): the worker reads fresh positions once and edits that one message.
 * A request lost in a concurrent write only leaves the message at the time it already shows.
 */
export type PositionViewRequest = {
  id: string;
  userId: string;
  chatId: number;
  messageId: number;
  at: number;
};

const KEY = "position-view-requests:v1";
/** Longer than a worker poll, so a request survives one failed poll. */
const REQUEST_TTL_MS = 60_000;
/** One refresh per chat this often, whichever message or button asked. */
export const VIEW_COOLDOWN_MS = 15_000;

export function parseViewRequests(value: unknown, now = Date.now()): PositionViewRequest[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is PositionViewRequest =>
      !!r &&
      typeof r === "object" &&
      typeof r.id === "string" &&
      typeof r.userId === "string" &&
      typeof r.chatId === "number" &&
      typeof r.messageId === "number" &&
      typeof r.at === "number" &&
      now - r.at < REQUEST_TTL_MS,
  );
}

export async function readPositionViews(now = Date.now()) {
  return parseViewRequests(await getCache().get(KEY), now);
}

/** A refresh for this chat was asked for moments ago; a failed read does not block a new one. */
export async function positionViewCooling(chatId: number, now = Date.now()) {
  const requests = await readPositionViews(now).catch(() => []);
  return requests.some((r) => r.chatId === chatId && now - r.at < VIEW_COOLDOWN_MS);
}

/** Returns false when the signal is unavailable, so the caller does not promise a refresh. */
export async function requestPositionView(
  request: Pick<PositionViewRequest, "userId" | "chatId" | "messageId">,
  now = Date.now(),
): Promise<boolean> {
  try {
    const current = await readPositionViews(now);
    const next = [
      ...current.filter((r) => r.chatId !== request.chatId),
      { ...request, id: `${request.chatId}:${request.messageId}:${now}`, at: now },
    ];
    await getCache().set(KEY, next, {
      ttl: Math.ceil(REQUEST_TTL_MS / 1000) + 60,
      name: "position-views",
    });
    return true;
  } catch {
    return false;
  }
}
