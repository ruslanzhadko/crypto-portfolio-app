"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { useLatestAlertAt } from "@/lib/alerts/unread";
import { formatUsd } from "@/lib/utils/format";
import type { PositionLogDetails } from "@/lib/positions/delivery";
import { formatDuration } from "./notification-log";

type LogEntry = {
  id: string;
  tokenSymbol: string;
  deltaPercent: number;
  price: number;
  sentAt: string;
  kind: string | null;
  details: Partial<PositionLogDetails> | null;
  trigger: {
    triggerType: string;
    targetPrice: number | null;
    tokenName: string;
  } | null;
};

/** At most this many pop up at once; the rest wait in the log. */
const MAX_TOASTS = 3;
const TOAST_MS = 8_000;

/**
 * Pops up alerts that fire while a page of the site is open, next to Telegram. Alerts that already
 * existed when the page opened stay in the log only.
 */
export function AlertToasts() {
  const t = useTranslations("Alerts");
  const tp = useTranslations("PositionAlerts.log");
  const { toast } = useToast();
  const latestAt = useLatestAlertAt();
  // Newest alert already shown (or present when the page opened).
  const shownUpTo = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (latestAt === undefined) return;
    const before = shownUpTo.current;
    shownUpTo.current = Math.max(latestAt ?? 0, before ?? 0);
    if (before === undefined || latestAt == null || latestAt <= before) return;
    let cancelled = false;
    void fetch(`/api/alerts/logs?page=1&pageSize=${MAX_TOASTS}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { logs?: LogEntry[] } | null) => {
        if (cancelled || !body) return;
        const logs = body.logs ?? [];
        const fresh = logs
          .filter((log) => new Date(log.sentAt).getTime() > before)
          .reverse();
        for (const log of fresh)
          toast({ ...describe(log, t, tp), duration: TOAST_MS });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [latestAt, toast, t, tp]);

  return null;
}

/** Toast text for one log entry, the same wording as the log itself. */
function describe(
  log: LogEntry,
  t: ReturnType<typeof useTranslations<"Alerts">>,
  tp: ReturnType<typeof useTranslations<"PositionAlerts.log">>,
): { title: string; description: string } {
  if (log.kind) {
    const d = log.details ?? {};
    const event =
      log.kind === "pnlSign"
        ? tp(d.positive ? "pnlPlus" : "pnlMinus")
        : ["opened", "closed", "liquidation"].includes(log.kind)
          ? tp(log.kind)
          : log.kind;
    const side = d.side
      ? `${d.side === "long" ? "LONG" : "SHORT"}${d.leverage ? ` ×${Number(d.leverage)}` : ""}`
      : null;
    const detail =
      log.kind === "liquidation" && d.distancePercent != null
        ? tp("distance", { value: d.distancePercent.toFixed(1) })
        : d.pnlUsd != null
          ? tp(d.approximate ? "pnlApprox" : "pnl", {
              value: `${d.pnlUsd > 0 ? "+" : d.pnlUsd < 0 ? "−" : ""}${formatUsd(Math.abs(d.pnlUsd), { minimumFractionDigits: 2 })}`,
            })
          : null;
    return {
      title: `${event} · ${log.tokenSymbol}`,
      description: [
        d.label,
        side,
        detail,
        log.kind === "closed" && d.durationMs != null ? formatDuration(d.durationMs, tp) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const target = log.trigger?.triggerType === "PRICE_TARGET";
  const change = `${log.deltaPercent > 0 ? "+" : log.deltaPercent < 0 ? "−" : ""}${Math.abs(log.deltaPercent).toFixed(2)}%`;
  return {
    title: `${log.tokenSymbol} · ${log.trigger?.tokenName ?? ""}`.replace(
      / · $/,
      "",
    ),
    description: target
      ? t("logTargetHit", {
          price: formatUsd(log.trigger?.targetPrice ?? log.price),
        })
      : `${change} · ${formatUsd(log.price)}`,
  };
}
