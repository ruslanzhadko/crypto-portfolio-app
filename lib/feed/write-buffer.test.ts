import { describe, expect, it } from "vitest";
import { FEED_FLUSH_WINDOW_MS, FeedWriteBuffer } from "./write-buffer";

type Post = { id: number; text: string };
const setup = (live: boolean, start = 10 * FEED_FLUSH_WINDOW_MS + 5_000) => {
  const written: string[] = [];
  let now = start;
  const buffer = new FeedWriteBuffer<Post>(
    {
      write: async (post) => {
        written.push(`${post.id}:${post.text}`);
      },
      key: (post) => String(post.id),
      now: () => now,
    },
    live,
  );
  return { buffer, written, advance: (ms: number) => (now += ms) };
};

describe("FeedWriteBuffer", () => {
  it("writes at once while the feed is watched", async () => {
    const { buffer, written } = setup(true);
    await buffer.submit({ id: 1, text: "a" });
    expect(written).toEqual(["1:a"]);
    expect(buffer.size).toBe(0);
  });

  it("holds posts while nobody watches and keeps only the latest edit", async () => {
    const { buffer, written } = setup(false);
    await buffer.submit({ id: 1, text: "a" });
    await buffer.submit({ id: 1, text: "edited" });
    await buffer.submit({ id: 2, text: "b" });
    expect(await buffer.tick(false)).toBe(false);
    expect(written).toEqual([]);
    expect(buffer.size).toBe(2);
  });

  it("flushes as soon as a viewer appears", async () => {
    const { buffer, written } = setup(false);
    await buffer.submit({ id: 1, text: "a" });
    await buffer.submit({ id: 2, text: "b" });
    expect(await buffer.tick(true)).toBe(true);
    expect(written).toEqual(["1:a", "2:b"]);
    await buffer.submit({ id: 3, text: "c" });
    expect(written.at(-1)).toBe("3:c");
  });

  it("flushes once per aligned window without viewers", async () => {
    const { buffer, written, advance } = setup(false);
    await buffer.submit({ id: 1, text: "a" });
    advance(FEED_FLUSH_WINDOW_MS);
    expect(await buffer.tick(false)).toBe(true);
    expect(written).toEqual(["1:a"]);
    expect(await buffer.tick(false)).toBe(false);
  });

  it("retries a failing post and then drops it", async () => {
    let calls = 0;
    const dropped: number[] = [];
    const buffer = new FeedWriteBuffer<Post>(
      {
        write: async () => {
          calls++;
          throw new Error("db down");
        },
        key: (post) => String(post.id),
        maxAttempts: 2,
        onError: (post) => void dropped.push(post.id),
      },
      false,
    );
    await buffer.submit({ id: 1, text: "a" });
    await buffer.flush();
    expect(buffer.size).toBe(1);
    await buffer.flush();
    expect(buffer.size).toBe(0);
    expect(calls).toBe(2);
    expect(dropped).toEqual([1]);
  });

  it("flushes early when the buffer is full", async () => {
    const written: number[] = [];
    const buffer = new FeedWriteBuffer<Post>(
      {
        write: async (post) => void written.push(post.id),
        key: (post) => String(post.id),
        maxItems: 2,
      },
      false,
    );
    await buffer.submit({ id: 1, text: "a" });
    await buffer.submit({ id: 2, text: "b" });
    expect(written).toEqual([1, 2]);
  });
});
