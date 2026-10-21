/** Posts are written at once while the feed is watched, otherwise in aligned windows. */
export const FEED_FLUSH_WINDOW_MS = 30 * 60_000;

type Options<T> = {
  write: (item: T) => Promise<void>;
  key: (item: T) => string;
  maxItems?: number;
  maxAttempts?: number;
  /** A write that takes longer is treated as failed, so a hung connection cannot wedge the buffer. */
  writeTimeoutMs?: number;
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
  private readonly writeTimeoutMs: number;
  private retryDue = false;
  private readonly now: () => number;

  /** `live` defaults to true: without a viewer signal every post is written at once. */
  constructor(
    private readonly options: Options<T>,
    live = true,
  ) {
    this.live = live;
    this.maxItems = options.maxItems ?? 500;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.writeTimeoutMs = options.writeTimeoutMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.flushedWindow = Math.floor(this.now() / FEED_FLUSH_WINDOW_MS);
  }

  get size() {
    return this.pending.size;
  }

  /** A newer version of the same post (an edit) replaces the queued one. */
  async submit(item: T): Promise<void> {
    if (this.live) {
      await this.writeWithTimeout(item);
      return;
    }
    this.pending.set(this.options.key(item), { item, attempts: 0 });
    if (this.pending.size >= this.maxItems) await this.flush();
  }

  /** True once the aligned window that has not been flushed yet has begun. */
  windowDue(): boolean {
    return Math.floor(this.now() / FEED_FLUSH_WINDOW_MS) > this.flushedWindow;
  }

  /** Called every few seconds; returns true when a flush ran. */
  async tick(live: boolean): Promise<boolean> {
    this.live = live;
    const windowDue = this.windowDue();
    // Failed posts are retried on the next tick instead of waiting for the next window.
    if (!live && !windowDue && !this.retryDue) return false;
    if (windowDue)
      this.flushedWindow = Math.floor(this.now() / FEED_FLUSH_WINDOW_MS);
    await this.flush();
    return true;
  }

  private async writeWithTimeout(item: T) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.options.write(item),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Feed write timed out")),
            this.writeTimeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Writes queued posts in arrival order; a failed post is retried a few times, then dropped. */
  flush(): Promise<void> {
    // The reset must run after the assignment: with nothing queued the drain finishes synchronously,
    // and a reset inside it would be overwritten, leaving a settled promise that blocks every later flush.
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async drain(): Promise<void> {
    this.retryDue = false;
    for (const [key, entry] of [...this.pending]) {
      try {
        await this.writeWithTimeout(entry.item);
        this.pending.delete(key);
      } catch (error) {
        this.retryDue = true;
        if (++entry.attempts >= this.maxAttempts) {
          this.pending.delete(key);
          this.options.onError?.(entry.item, error);
        }
      }
    }
    if (!this.pending.size) this.retryDue = false;
  }
}
