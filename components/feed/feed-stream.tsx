"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Filter,
  Flame,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type PostType =
  | "NEWS"
  | "LISTING"
  | "ARBITRAGE"
  | "PRICE_ANOMALY"
  | "LIQUIDATION"
  | "TRADE_IDEA"
  | "AIRDROP"
  | "ANALYSIS"
  | "OTHER";
type FilterType = "ALL" | PostType;

interface FeedPost {
  id: string;
  telegramMessageId: number;
  type: PostType;
  text: string;
  title: string | null;
  symbol: string | null;
  direction: string | null;
  exchange: string | null;
  changePercent: number | null;
  intervalSeconds: number | null;
  amountUsd: number | null;
  priceUsd: number | null;
  limitUsd: number | null;
  mediaUrl: string | null;
  telegramUrl: string;
  publishedAt: string;
  source: { username: string; title: string; avatarUrl: string | null };
}

interface FeedResponse {
  posts: FeedPost[];
  sources: { username: string; title: string }[];
  nextCursor: string | null;
  serverTime: string;
}

interface FeedGroup {
  key: string;
  posts: FeedPost[];
  latest: FeedPost;
}

const FILTERS: FilterType[] = [
  "ALL",
  "NEWS",
  "LISTING",
  "ARBITRAGE",
  "PRICE_ANOMALY",
  "LIQUIDATION",
  "TRADE_IDEA",
  "AIRDROP",
  "ANALYSIS",
];
const MACHINE_TYPES = new Set<PostType>(["PRICE_ANOMALY", "LIQUIDATION"]);

function groupBurstPosts(posts: FeedPost[]): FeedGroup[] {
  const groups: FeedGroup[] = [];
  const keyed = new Map<string, FeedGroup>();

  for (const post of posts) {
    if (!MACHINE_TYPES.has(post.type) || !post.symbol) {
      groups.push({ key: post.id, posts: [post], latest: post });
      continue;
    }
    const bucket = Math.floor(new Date(post.publishedAt).getTime() / 120_000);
    const key = `${post.source.username}:${post.type}:${post.symbol}:${bucket}`;
    const existing = keyed.get(key);
    if (existing) {
      existing.posts.push(post);
    } else {
      const group = { key, posts: [post], latest: post };
      keyed.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}

function compactUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 2,
  }).format(value);
}

function relativeTime(value: string, locale: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return rtf.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function FeedStream() {
  const t = useTranslations("Feed");
  const locale = useLocale();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [sources, setSources] = useState<FeedResponse["sources"]>([]);
  const [type, setType] = useState<FilterType>("ALL");
  const [source, setSource] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstLoad = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const querySignature = `${type}|${source}|${search}`;
  const querySignatureRef = useRef(querySignature);
  querySignatureRef.current = querySignature;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (quiet = false) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const requestId = ++requestSequence.current;
      if (!quiet) setRefreshing(true);
      try {
        const params = new URLSearchParams({ type, limit: "60" });
        if (source !== "ALL") params.set("source", source);
        if (search) params.set("search", search);
        const response = await fetch(`/api/feed?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(t("loadError"));
        const data = (await response.json()) as FeedResponse;
        if (requestId !== requestSequence.current) return;
        if (quiet) {
          setPosts((current) => {
            const incoming = new Set(data.posts.map((post) => post.id));
            return [
              ...data.posts,
              ...current.filter((post) => !incoming.has(post.id)),
            ];
          });
        } else {
          setPosts(data.posts);
          setNextCursor(data.nextCursor);
        }
        setSources(data.sources);
        setLastUpdate(new Date(data.serverTime));
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
          firstLoad.current = false;
        }
      }
    },
    [search, source, t, type],
  );

  useEffect(() => {
    historyRequest.current?.abort();
    setLoadingMore(false);
    setLoading(firstLoad.current);
    void load();
    const timer = window.setInterval(() => void load(true), 5_000);
    return () => {
      window.clearInterval(timer);
      activeRequest.current?.abort();
      historyRequest.current?.abort();
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    const requestedSignature = querySignature;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        type,
        limit: "60",
        before: nextCursor,
      });
      if (source !== "ALL") params.set("source", source);
      if (search) params.set("search", search);
      const response = await fetch(`/api/feed?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(t("loadError"));
      const data = (await response.json()) as FeedResponse;
      if (querySignatureRef.current !== requestedSignature) return;
      setPosts((current) => {
        const ids = new Set(current.map((post) => post.id));
        return [...current, ...data.posts.filter((post) => !ids.has(post.id))];
      });
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, querySignature, search, source, t, type]);

  const groups = useMemo(() => groupBurstPosts(posts), [posts]);

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-20 -mx-2 space-y-3 bg-background/95 px-2 py-2 backdrop-blur-sm">
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label={t("filterByType")}
        >
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setType(filter)}
              aria-pressed={type === filter}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                type === filter
                  ? "bg-text text-background"
                  : "bg-surface-2 text-text-muted hover:text-text",
              )}
            >
              {t(`filters.${filter}`)}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="pl-9"
            />
          </label>
          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              aria-label={t("sourceLabel")}
              className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-2 pl-9 pr-8 text-sm text-text ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <option value="ALL">{t("allSources")}</option>
              {sources.map((item) => (
                <option key={item.username} value={item.username}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void load()}
            disabled={refreshing}
            aria-label={t("refresh")}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                refreshing && "animate-spin motion-reduce:animate-none",
              )}
            />
          </Button>
        </div>
      </div>

      {lastUpdate && !error && (
        <p className="text-xs text-text-muted">
          {t("updated", {
            time: relativeTime(lastUpdate.toISOString(), locale),
          })}
        </p>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-danger/10 p-4 text-sm text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <FeedSkeleton />
      ) : groups.length ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
            {groups.map((group) => (
              <FeedRow key={group.key} group={group} locale={locale} />
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? t("loadingMore") : t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl bg-surface px-6 text-center shadow-card">
          <Newspaper className="mb-4 h-9 w-9 text-text-muted" />
          <h2 className="font-semibold">
            {type !== "ALL" || source !== "ALL" || search
              ? t("noResultsTitle")
              : t("emptyTitle")}
          </h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
            {type !== "ALL" || source !== "ALL" || search
              ? t("noResultsDescription")
              : t("emptyDescription")}
          </p>
          {(type !== "ALL" || source !== "ALL" || search) && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setType("ALL");
                setSource("ALL");
                setSearchInput("");
              }}
            >
              {t("clearFilters")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FeedRow({ group, locale }: { group: FeedGroup; locale: string }) {
  const t = useTranslations("Feed");
  const [expanded, setExpanded] = useState(false);
  const post = group.latest;
  const type = typeMeta(post.type, post.direction);
  const Icon = type.icon;
  const totalAmount = group.posts.reduce(
    (sum, item) => sum + (item.amountUsd ?? 0),
    0,
  );

  return (
    <article className="group border-b border-border/80 p-4 last:border-b-0 md:p-5">
      <div className="flex gap-3 md:gap-4">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            type.surface,
          )}
        >
          <Icon className={cn("h-[18px] w-[18px]", type.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-text">{post.source.title}</span>
            <span className="text-text-muted">@{post.source.username}</span>
            <span className="text-text-muted" aria-hidden="true">
              ·
            </span>
            <time className="text-text-muted" dateTime={post.publishedAt}>
              {relativeTime(post.publishedAt, locale)}
            </time>
            {group.posts.length > 1 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                {t("eventCount", { count: group.posts.length })}
              </span>
            )}
          </div>

          {MACHINE_TYPES.has(post.type) ? (
            <MachineEvent
              post={post}
              totalAmount={totalAmount}
              locale={locale}
            />
          ) : (
            <div className="mt-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wide",
                    type.color,
                  )}
                >
                  {t(`types.${post.type}`)}
                </span>
                {post.symbol && (
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold">
                    {post.symbol}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-text md:text-[15px]">
                {!expanded && post.text.length > 560
                  ? `${post.text.slice(0, 560).trim()}\u2026`
                  : post.text}
              </p>
              {post.text.length > 560 && (
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                  className="mt-2 min-h-10 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {expanded ? t("showLess") : t("showMore")}
                </button>
              )}
            </div>
          )}

          <a
            href={post.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("openTelegram")} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

function MachineEvent({
  post,
  totalAmount,
  locale,
}: {
  post: FeedPost;
  totalAmount: number;
  locale: string;
}) {
  const t = useTranslations("Feed");
  const positive = post.direction === "UP" || post.direction === "SHORT";
  const DirectionIcon = positive ? ArrowUpRight : ArrowDownRight;

  if (post.type === "LIQUIDATION") {
    return (
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-bold tabular-nums text-text">
          {post.symbol}
        </span>
        <span
          className={cn(
            "text-sm font-semibold",
            post.direction === "LONG" ? "text-danger" : "text-success",
          )}
        >
          {t("liquidated", {
            side:
              post.direction === "LONG"
                ? t("sides.LONG")
                : post.direction === "SHORT"
                  ? t("sides.SHORT")
                  : "—",
          })}
        </span>
        <span className="text-lg font-bold tabular-nums">
          {compactUsd(totalAmount || post.amountUsd || 0, locale)}
        </span>
        {post.priceUsd != null && (
          <span className="text-sm tabular-nums text-text-muted">
            @ {compactUsd(post.priceUsd, locale)}
          </span>
        )}
        {post.exchange && (
          <span className="text-xs text-text-muted">{post.exchange}</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-lg font-bold text-text">{post.symbol}</span>
      <span
        className={cn(
          "inline-flex items-center text-lg font-bold tabular-nums",
          positive ? "text-success" : "text-danger",
        )}
      >
        <DirectionIcon className="mr-0.5 h-5 w-5" />
        {post.changePercent != null &&
          `${post.changePercent > 0 ? "+" : ""}${post.changePercent.toFixed(2)}%`}
      </span>
      {post.intervalSeconds != null && (
        <span className="text-sm text-text-muted">
          {t("inSeconds", { seconds: post.intervalSeconds })}
        </span>
      )}
      {post.limitUsd != null && (
        <span className="text-xs tabular-nums text-text-muted">
          {t("limit", { value: compactUsd(post.limitUsd, locale) })}
        </span>
      )}
    </div>
  );
}

function typeMeta(type: PostType, direction: string | null) {
  switch (type) {
    case "PRICE_ANOMALY":
      return {
        icon: Zap,
        color: direction === "UP" ? "text-success" : "text-danger",
        surface: direction === "UP" ? "bg-success/10" : "bg-danger/10",
      };
    case "LIQUIDATION":
      return { icon: Flame, color: "text-warning", surface: "bg-warning/10" };
    case "LISTING":
      return {
        icon: Sparkles,
        color: "text-primary",
        surface: "bg-primary/10",
      };
    case "ARBITRAGE":
      return {
        icon: ArrowUpRight,
        color: "text-success",
        surface: "bg-success/10",
      };
    default:
      return {
        icon: Newspaper,
        color: "text-text-muted",
        surface: "bg-surface-2",
      };
  }
}

function FeedSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex gap-4 border-b border-border p-5 last:border-0"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="w-full space-y-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
