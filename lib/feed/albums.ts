import type { FeedTextLink } from "./links";
import { readFeedTextLinks } from "./links";

export function readTelegramAlbumId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).telegramAlbumId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export interface AlbumPost {
  id: string;
  sourceId: string;
  telegramMessageId: number;
  text: string;
  mediaUrl: string | null;
  metadata: unknown;
  publishedAt: Date;
}

export type GroupedAlbumPost<T extends AlbumPost> = T & {
  albumId: string | null;
  mediaUrls: string[];
  links: FeedTextLink[];
};

/** Keep one feed card per Telegram album, with captions and images in message order. */
export function groupTelegramAlbums<T extends AlbumPost>(
  posts: T[],
): GroupedAlbumPost<T>[] {
  const groups = new Map<string, T[]>();

  for (const post of posts) {
    const albumId = readTelegramAlbumId(post.metadata);
    const key = albumId ? `album:${post.sourceId}:${albumId}` : `post:${post.id}`;
    const group = groups.get(key) ?? [];
    group.push(post);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((members) => {
      members.sort((a, b) => a.telegramMessageId - b.telegramMessageId);
      const captionPost = members.find((member) => member.text.trim()) ?? members[0]!;
      const albumId = readTelegramAlbumId(captionPost.metadata);
      const mediaUrls = members.flatMap((member) =>
        member.mediaUrl ? [member.mediaUrl] : [],
      );
      const links: FeedTextLink[] = [];
      let text = "";

      for (const member of members) {
        if (!member.text.trim()) continue;
        if (text) text += "\n\n";
        const offset = text.length;
        text += member.text;
        links.push(
          ...readFeedTextLinks(member.metadata).map((link) => ({
            ...link,
            offset: link.offset + offset,
          })),
        );
      }

      return {
        ...captionPost,
        id: albumId ? `album:${captionPost.sourceId}:${albumId}` : captionPost.id,
        text,
        mediaUrl: mediaUrls[0] ?? null,
        publishedAt: members.at(-1)!.publishedAt,
        albumId,
        mediaUrls,
        links,
      };
    })
    .sort(
      (a, b) =>
        b.publishedAt.getTime() - a.publishedAt.getTime() ||
        b.telegramMessageId - a.telegramMessageId,
    );
}
