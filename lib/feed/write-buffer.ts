/** Posts are written at once while the feed is watched, otherwise in aligned windows. */
export const FEED_FLUSH_WINDOW_MS = 30 * 60_000;

type Options<T> = {
  write: (item: T) => Promise<void>;
  key: (item: T) => string;
  maxItems?: number;
  maxAttempts?: number;
  now?: () => number;
  onError?: (item: T, error: unknown) => void;
};

export class FeedWriteBuffer<T> {
  private readonly pending = new Map<string, { item: T; attempts: number }>();
  private live: boolean;
  private flushedWindow: number;
  private flushing: Promise<void> | null = null;
  private readonly maxItems: number;
  private readonly maxAttempts: number;
  private readonly now: () => number;

  /** `live` defaults to true: without a viewer signal every post is written at once. */
  constructor(
    private readonly options: Options<T>,
    live = true,
  ) {
    this.live = live;
    this.maxItems = options.maxItems ?? 500;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.now = options.now ?? Date.now;
    this.flushedWindow = Math.floor(this.now() / FEED_FLUSH_WINDOW_MS);
  }

  get size() {
    return this.pending.size;
  }

  /** A newer version of the same post (an edit) replaces the queued one. */
  async submit(item: T): Promise<void> {
    if (this.live) {
      await this.options.write(item);
      return;
    }
    this.pending.set(this.options.key(item), { item, attempts: 0 });
    if (this.pending.size >= this.maxItems) await this.flush();
  }

  /** Called every few seconds; returns true when a flush ran. */
  async tick(live: boolean): Promise<boolean> {
    this.live = live;
    const window = Math.floor(this.now() / FEED_FLUSH_WINDOW_MS);
    const windowDue = window > this.flushedWindow;
    if (!live && !windowDue) return false;
    this.flushedWindow = window;
    await this.flush();
    return true;
  }

  /** Writes queued posts in arrival order; a failed post is retried a few times, then dropped. */
  flush(): Promise<void> {
    this.flushing ??= (async () => {
      try {
        for (const [key, entry] of [...this.pending]) {
          try {
            await this.options.write(entry.item);
            this.pending.delete(key);
          } catch (error) {
            if (++entry.attempts >= this.maxAttempts) {
              this.pending.delete(key);
              this.options.onError?.(entry.item, error);
            }
          }
        }
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }
}
