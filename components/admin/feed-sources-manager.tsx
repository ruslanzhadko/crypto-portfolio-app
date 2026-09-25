"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ExternalLink,
  Loader2,
  Plus,
  RadioTower,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface FeedSourceDTO {
  id: string;
  username: string;
  title: string;
  isActive: boolean;
  telegramId: string | null;
  lastMessageId: number | null;
  updatedAt: string;
  _count: { posts: number };
}

export function FeedSourcesManager() {
  const t = useTranslations("AdminFeedSources");
  const { toast } = useToast();
  const [sources, setSources] = useState<FeedSourceDTO[] | null>(null);
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/feed-sources", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { sources: FeedSourceDTO[] };
      setSources(data.sources);
      setLoadError(false);
    } catch {
      setSources([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channel.trim() || saving) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/feed-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      await response.json().catch(() => null);
      if (!response.ok) {
        toast({
          variant: "destructive",
          title: t("toastAddError"),
          description:
            response.status === 409
              ? t("toastAlreadyExists")
              : response.status === 400
                ? t("toastInvalidChannel")
                : t("toastTryAgain"),
        });
        return;
      }

      setChannel("");
      toast({ title: t("toastAdded") });
      await load();
    } catch {
      toast({
        variant: "destructive",
        title: t("toastNetworkError"),
        description: t("toastTryAgain"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleSource(source: FeedSourceDTO) {
    setChangingId(source.id);
    try {
      const response = await fetch(`/api/admin/feed-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !source.isActive }),
      });
      if (!response.ok) throw new Error();
      setSources((current) =>
        current?.map((item) =>
          item.id === source.id
            ? { ...item, isActive: !source.isActive }
            : item,
        ) ?? null,
      );
      toast({
        title: source.isActive ? t("toastDisabled") : t("toastEnabled"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("toastUpdateError"),
        description: t("toastTryAgain"),
      });
    } finally {
      setChangingId(null);
    }
  }

  async function deleteSource(source: FeedSourceDTO) {
    if (!confirm(t("confirmDelete", { channel: source.username }))) return;

    setChangingId(source.id);
    try {
      const response = await fetch(`/api/admin/feed-sources/${source.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setSources((current) =>
        current?.filter((item) => item.id !== source.id) ?? null,
      );
      toast({ title: t("toastDeleted") });
    } catch {
      toast({
        variant: "destructive",
        title: t("toastDeleteError"),
        description: t("toastTryAgain"),
      });
    } finally {
      setChangingId(null);
    }
  }

  const activeCount = sources?.filter((source) => source.isActive).length ?? 0;
  const waitingCount =
    sources?.filter((source) => source.isActive && !source.telegramId).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="text-xs font-medium text-text-muted">{t("summaryTotal")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {sources?.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl bg-success/10 px-4 py-3">
          <p className="text-xs font-medium text-success">{t("summaryActive")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-success">
            {activeCount}
          </p>
        </div>
        <div className="rounded-xl bg-warning/10 px-4 py-3">
          <p className="text-xs font-medium text-warning">{t("summaryWaiting")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
            {waitingCount}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
          <CardDescription>{t("addDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={addSource}>
            <div className="flex-1">
              <label className="sr-only" htmlFor="telegram-channel">
                {t("channelLabel")}
              </label>
              <Input
                id="telegram-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                placeholder={t("channelPlaceholder")}
                aria-describedby="telegram-channel-hint"
                autoComplete="off"
              />
              <p id="telegram-channel-hint" className="mt-2 text-xs text-text-muted">
                {t("channelHint")}
              </p>
            </div>
            <Button type="submit" disabled={!channel.trim() || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {saving ? t("adding") : t("addButton")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t("listTitle")}</CardTitle>
            <CardDescription>{t("listDescription")}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("refresh")}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {sources === null ? (
            <div className="space-y-3 px-4 pb-5 sm:px-6 sm:pb-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : loadError ? (
            <div className="mx-4 mb-5 flex flex-col items-start gap-3 rounded-xl bg-danger/10 p-4 sm:mx-6 sm:mb-6">
              <p className="text-sm text-danger">{t("loadError")}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                {t("retry")}
              </Button>
            </div>
          ) : sources.length === 0 ? (
            <div className="px-6 pb-8 pt-2 text-center">
              <RadioTower className="mx-auto h-9 w-9 text-text-muted" />
              <h2 className="mt-3 text-sm font-semibold">{t("emptyTitle")}</h2>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-text-muted">
                {t("emptyDescription")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sources.map((source) => {
                const connected = Boolean(source.telegramId);
                const changing = changingId === source.id;
                return (
                  <div
                    key={source.id}
                    className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-2/30 sm:flex-row sm:items-center sm:px-6"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          source.isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-surface-2 text-text-muted"
                        }`}
                      >
                        {source.isActive ? (
                          <Wifi className="h-4 w-4" />
                        ) : (
                          <WifiOff className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{source.title}</p>
                          <Badge
                            variant={
                              !source.isActive
                                ? "secondary"
                                : connected
                                  ? "success"
                                  : "warning"
                            }
                          >
                            {!source.isActive
                              ? t("statusDisabled")
                              : connected
                                ? t("statusConnected")
                                : t("statusWaiting")}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                          <a
                            href={`https://t.me/${source.username}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline-offset-4 hover:text-text hover:underline"
                          >
                            @{source.username}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <span>{t("postsCount", { count: source._count.posts })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pl-[52px] sm:justify-end sm:pl-0">
                      <span className="text-xs text-text-muted">
                        {source.isActive ? t("enabledLabel") : t("disabledLabel")}
                      </span>
                      {changing && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
                      {source._count.posts === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-text-muted hover:text-danger"
                          onClick={() => void deleteSource(source)}
                          disabled={changing}
                          aria-label={t("deleteAria", { channel: source.username })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Switch
                        checked={source.isActive}
                        onCheckedChange={() => void toggleSource(source)}
                        disabled={changing}
                        aria-label={
                          source.isActive
                            ? t("disableAria", { channel: source.username })
                            : t("enableAria", { channel: source.username })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="max-w-3xl text-xs leading-5 text-text-muted">
        {t("syncNote")}
      </p>
    </div>
  );
}
