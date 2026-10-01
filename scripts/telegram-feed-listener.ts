import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import { classifyFeedPost } from "../lib/feed/classify-post";
import { extractTelegramLinks } from "../lib/feed/links";
import { prepareFeedImage, type FeedImagePayload } from "../lib/feed/media";
import { compatiblePhotoThumb } from "../lib/feed/telegram-photo";

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

type ChannelUpdate = { message?: Api.Message };

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connectionRetries: 10,
  autoReconnect: true,
});

const watchers = new Map<string, () => void>();
let syncTimer: ReturnType<typeof setInterval> | undefined;
let syncing = false;
const MAX_TELEGRAM_PHOTO_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const SOURCE_SYNC_INTERVAL_MS = 30 * 60_000;

function photoSizeBytes(size: Api.TypePhotoSize): number {
  if (size instanceof Api.PhotoSize) return size.size;
  if (size instanceof Api.PhotoSizeProgressive) {
    return Math.max(0, ...size.sizes);
  }
  if (
    size instanceof Api.PhotoCachedSize ||
    size instanceof Api.PhotoStrippedSize
  ) {
    return size.bytes.length;
  }
  return 0;
}

function selectPhotoThumb(
  media: Api.MessageMediaPhoto,
): Api.TypePhotoSize | undefined {
  if (!(media.photo instanceof Api.Photo)) return undefined;
  const candidates = media.photo.sizes
    .map((size) => ({ size, bytes: photoSizeBytes(size) }))
    .filter((item) => item.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
  const selected = (
    candidates.find((item) => item.bytes <= MAX_TELEGRAM_PHOTO_DOWNLOAD_BYTES)
      ?.size ?? candidates.at(-1)?.size
  );
  return selected ? compatiblePhotoThumb(selected) : undefined;
}

async function downloadPhoto(
  message: Api.Message,
): Promise<FeedImagePayload | null> {
  if (!(message.media instanceof Api.MessageMediaPhoto)) return null;
  try {
    const downloaded = await client.downloadMedia(message, {
      thumb: selectPhotoThumb(message.media),
      requestTimeout: 30_000,
    });
    if (!Buffer.isBuffer(downloaded)) return null;
    const image = prepareFeedImage(downloaded);
    if (!image)
      console.warn(`[feed] skipped photo #${message.id}: bytes=${downloaded.length}, signature=${downloaded.subarray(0, 8).toString("hex")}`);
    return image;
  } catch (error) {
    console.warn(`[feed] photo download failed #${message.id}`, error);
    return null;
  }
}

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
  message: Api.Message | undefined,
) {
  if (!message?.id || !message.date) return;

  const hasPhoto = message.media instanceof Api.MessageMediaPhoto;
  if (!message.message?.trim() && !hasPhoto) return;

  const rawText = message.message ?? "";
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
    albumChecked: true,
    ...(message.groupedId
      ? { telegramAlbumId: message.groupedId.toString() }
      : {}),
  };
  const classified = classifyFeedPost(text);
  const publishedAt = new Date(message.date * 1000);
  const editedAt = message.editDate ? new Date(message.editDate * 1000) : null;
  const image = hasPhoto ? await downloadPhoto(message) : null;

  await prisma.$transaction(async (tx) => {
    const post = await tx.telegramFeedPost.upsert({
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
    });

    if (image) {
      await tx.telegramFeedMedia.upsert({
        where: { postId: post.id },
        create: { postId: post.id, ...image },
        update: image,
      });
      await tx.telegramFeedPost.update({
        where: { id: post.id },
        data: { mediaUrl: `/api/feed/media/${post.id}` },
      });
    }

    await tx.telegramFeedSource.update({
      where: { id: sourceId },
      data: { lastMessageId: message.id },
    });
  });

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

// Previously saved photos did not retain Telegram's album ID. Restore it
// from Telegram by message ID without downloading or rewriting the images.
async function backfillStoredAlbumIds(username: string, sourceId: string) {
  const stored = await prisma.telegramFeedPost.findMany({
    where: { sourceId, mediaUrl: { not: null } },
    select: { id: true, telegramMessageId: true, metadata: true },
  });
  const unchecked = stored.filter((post) => {
    const metadata = post.metadata;
    return !(
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      metadata.albumChecked === true
    );
  });
  let updated = 0;

  for (let offset = 0; offset < unchecked.length; offset += 100) {
    const batch = unchecked.slice(offset, offset + 100);
    const messages = await client.getMessages(username, {
      ids: batch.map((post) => post.telegramMessageId),
    });
    const byId = new Map(
      messages
        .filter(
          (message): message is Api.Message => message instanceof Api.Message,
        )
        .map((message) => [message.id, message]),
    );

    for (const post of batch) {
      const message = byId.get(post.telegramMessageId);
      if (!message) continue;
      const previous =
        post.metadata &&
        typeof post.metadata === "object" &&
        !Array.isArray(post.metadata)
          ? post.metadata
          : {};
      const metadata = {
        ...previous,
        albumChecked: true,
        ...(message.groupedId
          ? { telegramAlbumId: message.groupedId.toString() }
          : {}),
      } as Prisma.InputJsonObject;
      await prisma.telegramFeedPost.update({
        where: { id: post.id },
        data: { metadata },
      });
      updated++;
    }
  }

  if (updated) {
    console.log(
      `[feed] restored album metadata for @${username}: ${updated} photos`,
    );
  }
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
      await saveMessage(
        username,
        source.id,
        message instanceof Api.Message ? message : undefined,
      );
    }
    console.log(
      `[feed] backfilled @${username}: ${recentMessages.length} messages`,
    );
    try {
      await backfillStoredAlbumIds(username, source.id);
    } catch (error) {
      console.warn(
        `[feed] album metadata backfill failed for @${username}`,
        error,
      );
    }
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

  if (process.argv.includes("--backfill-albums")) {
    const sources = await prisma.telegramFeedSource.findMany({
      where: { isActive: true },
      select: { id: true, username: true },
    });
    for (const source of sources) {
      await backfillStoredAlbumIds(source.username, source.id);
    }
    await client.disconnect();
    await prisma.$disconnect();
    console.log(`[feed] album backfill finished for ${sources.length} sources`);
    return;
  }

  await bootstrapSources();
  await syncSources();
  syncTimer = setInterval(() => void syncSources(), SOURCE_SYNC_INTERVAL_MS);

  console.log(`[feed] listener started for ${watchers.size} channels`);
  console.log(
    "[feed] source list refreshes from the database every 30 minutes",
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
