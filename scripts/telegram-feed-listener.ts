import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import { classifyFeedPost } from "../lib/feed/classify-post";
import { extractTelegramLinks } from "../lib/feed/links";

const DEFAULT_CHANNELS = [
  "arbitrageaggregator",
  "ua_cryptomania",
  "kormushka_mexc",
  "makerprod",
  "BWEnews_RU",
  "shflipnews",
  "BigLiquid",
];

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";
const session = process.env.TELEGRAM_USER_SESSION ?? "";
const bootstrapChannels = (
  process.env.TELEGRAM_FEED_CHANNELS ?? DEFAULT_CHANNELS.join(",")
)
  .split(",")
  .map((channel) => channel.trim().replace(/^@/, "").toLowerCase())
  .filter(Boolean);

if (!Number.isInteger(apiId) || !apiHash || !session) {
  throw new Error(
    "TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_USER_SESSION are required.",
  );
}

type ChannelUpdate = {
  message?: {
    id?: number;
    message?: string;
    entities?: Array<{
      className?: string;
      offset?: number;
      length?: number;
      url?: string;
    }>;
    date?: number;
    editDate?: number;
  };
};

type ChannelMessage = NonNullable<ChannelUpdate["message"]>;

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connectionRetries: 10,
  autoReconnect: true,
});

const watchers = new Map<string, () => void>();
let syncTimer: ReturnType<typeof setInterval> | undefined;
let syncing = false;

async function ensureSource(username: string) {
  const entity = await client.getEntity(username);
  const title =
    "title" in entity && typeof entity.title === "string"
      ? entity.title
      : `@${username}`;
  return prisma.telegramFeedSource.upsert({
    where: { username },
    create: {
      username,
      telegramId: entity.id.toString(),
      title,
    },
    update: {
      telegramId: entity.id.toString(),
      title,
      isActive: true,
    },
  });
}

async function saveMessage(
  username: string,
  sourceId: string,
  message: ChannelMessage | undefined,
) {
  if (!message?.id || !message.message?.trim() || !message.date) return;

  const rawText = message.message;
  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const text = rawText.trim();
  const links = extractTelegramLinks(
    text,
    message.entities?.map((entity) => ({
      ...entity,
      offset:
        typeof entity.offset === "number"
          ? entity.offset - leadingWhitespace
          : entity.offset,
    })),
  );
  const metadata: Prisma.InputJsonObject = {
    links: links.map((link) => ({
      offset: link.offset,
      length: link.length,
      url: link.url,
    })),
  };
  const classified = classifyFeedPost(text);
  const publishedAt = new Date(message.date * 1000);
  const editedAt = message.editDate ? new Date(message.editDate * 1000) : null;

  await prisma.$transaction([
    prisma.telegramFeedPost.upsert({
      where: {
        sourceId_telegramMessageId: {
          sourceId,
          telegramMessageId: message.id,
        },
      },
      create: {
        sourceId,
        telegramMessageId: message.id,
        text,
        metadata,
        telegramUrl: `https://t.me/${username}/${message.id}`,
        publishedAt,
        editedAt,
        ...classified,
      },
      update: {
        text,
        metadata,
        editedAt,
        ...classified,
      },
    }),
    prisma.telegramFeedSource.update({
      where: { id: sourceId },
      data: { lastMessageId: message.id },
    }),
  ]);

  console.log(`[feed] @${username} #${message.id} ${classified.type}`);
}

async function saveUpdate(
  username: string,
  sourceId: string,
  rawUpdate: unknown,
) {
  const update = rawUpdate as ChannelUpdate;
  await saveMessage(username, sourceId, update.message);
}

async function bootstrapSources() {
  const sourceCount = await prisma.telegramFeedSource.count();
  if (sourceCount > 0 || bootstrapChannels.length === 0) return;

  await prisma.telegramFeedSource.createMany({
    data: bootstrapChannels.map((username) => ({
      username,
      title: `@${username}`,
    })),
    skipDuplicates: true,
  });
  console.log(`[feed] bootstrapped ${bootstrapChannels.length} sources`);
}

async function startWatching(username: string) {
  const source = await ensureSource(username);
  const stop = client.updates.watch(username, async (update) => {
    await saveUpdate(username, source.id, update);
  });
  watchers.set(username, stop);
  console.log(`[feed] watching @${username}`);

  try {
    const recentMessages = await client.getMessages(username, { limit: 30 });
    for (const message of [...recentMessages].reverse()) {
      await saveMessage(username, source.id, message as ChannelMessage);
    }
    console.log(
      `[feed] backfilled @${username}: ${recentMessages.length} messages`,
    );
  } catch (error) {
    stop();
    watchers.delete(username);
    throw error;
  }
}

async function syncSources() {
  if (syncing) return;
  syncing = true;

  try {
    const activeSources = await prisma.telegramFeedSource.findMany({
      where: { isActive: true },
      select: { username: true },
    });
    const desired = new Set(activeSources.map((source) => source.username));

    for (const [username, stop] of watchers) {
      if (!desired.has(username)) {
        stop();
        watchers.delete(username);
        console.log(`[feed] stopped watching @${username}`);
      }
    }

    for (const { username } of activeSources) {
      if (watchers.has(username)) continue;
      try {
        await startWatching(username);
      } catch (error) {
        console.error(`[feed] failed to watch @${username}`, error);
      }
    }
  } finally {
    syncing = false;
  }
}

client.updates.catch((error, update) => {
  const updateName =
    update && "className" in update ? String(update.className) : "unknown";
  console.error("[telegram-feed] update error", updateName, error);
});

async function main() {
  await client.connect();
  if (!(await client.checkAuthorization())) {
    throw new Error(
      "Telegram session is not authorized. Run npm run telegram:feed:auth again.",
    );
  }

  await bootstrapSources();
  await syncSources();
  syncTimer = setInterval(() => void syncSources(), 30_000);

  console.log(`[feed] listener started for ${watchers.size} channels`);
  console.log(
    "[feed] source list refreshes from the database every 30 seconds",
  );
  await new Promise<void>(() => undefined);
}

async function shutdown(signal: string) {
  console.log(`[feed] ${signal}, shutting down`);
  if (syncTimer) clearInterval(syncTimer);
  for (const stop of watchers.values()) stop();
  watchers.clear();
  await client.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

void main().catch(async (error) => {
  console.error("[telegram-feed] startup failed", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
