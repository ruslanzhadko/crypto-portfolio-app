"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Clock,
  Flag,
  PlusCircle,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLatestAlertAt } from "@/lib/alerts/unread";
import { formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
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

type Tone = "positive" | "negative" | "warning" | "info";

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
        for (const log of fresh) {
          const { tone, icon, title, description } = describe(log, t, tp);
          toast({
            variant: tone,
            icon: <ToneIcon tone={tone} icon={icon} />,
            title,
            description,
            duration: TOAST_MS,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [latestAt, toast, t, tp]);

  return null;
}

const TONE_TEXT: Record<Tone, string> = {
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
  info: "text-primary",
};

const TONE_BUBBLE: Record<Tone, string> = {
  positive: "bg-success/15 text-success",
  negative: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-primary/15 text-primary",
};

function ToneIcon({ tone, icon: Icon }: { tone: Tone; icon: LucideIcon }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        TONE_BUBBLE[tone],
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function Title({ event, symbol }: { event: string; symbol: string }) {
  return (
    <span className="flex items-center gap-2 pr-6">
      <span>{event}</span>
      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold text-text">
        {symbol}
      </span>
    </span>
  );
}

function signed(value: number, text: string) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
}

/** Toast content for one log entry, the same wording as the log itself. */
function describe(
  log: LogEntry,
  t: ReturnType<typeof useTranslations<"Alerts">>,
  tp: ReturnType<typeof useTranslations<"PositionAlerts.log">>,
): { tone: Tone; icon: LucideIcon; title: ReactNode; description: ReactNode } {
  if (log.kind) {
    const d = log.details ?? {};
    const event =
      log.kind === "pnlSign"
        ? tp(d.positive ? "pnlPlus" : "pnlMinus")
        : ["opened", "closed", "liquidation"].includes(log.kind)
          ? tp(log.kind)
          : log.kind;
    const pnlTone: Tone | null =
      d.pnlUsd == null ? null : d.pnlUsd >= 0 ? "positive" : "negative";
    const tone: Tone =
      log.kind === "liquidation"
        ? "warning"
        : log.kind === "pnlSign"
          ? d.positive
            ? "positive"
            : "negative"
          : log.kind === "closed"
            ? (pnlTone ?? "info")
            : "info";
    const icon: LucideIcon =
      log.kind === "liquidation"
        ? AlertTriangle
        : log.kind === "pnlSign"
          ? d.positive
            ? TrendingUp
            : TrendingDown
          : log.kind === "closed"
            ? Flag
            : PlusCircle;
    const value =
      log.kind === "liquidation" && d.distancePercent != null
        ? tp("distance", { value: d.distancePercent.toFixed(1) })
        : d.pnlUsd != null
          ? tp(d.approximate ? "pnlApprox" : "pnl", {
              value: signed(
                d.pnlUsd,
                formatUsd(Math.abs(d.pnlUsd), { minimumFractionDigits: 2 }),
              ),
            })
          : null;
    const valueTone = log.kind === "liquidation" ? "warning" : pnlTone;
    return {
      tone,
      icon,
      title: <Title event={event} symbol={log.tokenSymbol} />,
      description: (
        <span className="grid gap-1.5">
          {(d.label || d.side) && (
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              {d.label && <span className="truncate">{d.label}</span>}
              {d.side && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-semibold",
                    d.side === "long"
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger",
                  )}
                >
                  {d.side === "long" ? "LONG" : "SHORT"}
                  {d.leverage ? ` ×${Number(d.leverage)}` : ""}
                </span>
              )}
            </span>
          )}
          {(value || (log.kind === "closed" && d.durationMs != null)) && (
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {value && (
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    valueTone ? TONE_TEXT[valueTone] : "text-text",
                  )}
                >
                  {value}
                </span>
              )}
              {log.kind === "closed" && d.durationMs != null && (
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="h-3 w-3" />
                  {formatDuration(d.durationMs, tp)}
                </span>
              )}
            </span>
          )}
        </span>
      ),
    };
  }
  const target = log.trigger?.triggerType === "PRICE_TARGET";
  const tone: Tone = target
    ? "info"
    : log.deltaPercent >= 0
      ? "positive"
      : "negative";
  const name = log.trigger?.tokenName;
  return {
    tone,
    icon: target ? Target : log.deltaPercent >= 0 ? TrendingUp : TrendingDown,
    title: (
      <span className="flex items-center gap-2 pr-6">
        <span className="font-mono">{log.tokenSymbol}</span>
        {name && name !== log.tokenSymbol && (
          <span className="truncate font-normal text-text-muted">{name}</span>
        )}
      </span>
    ),
    description: target ? (
      <span className="text-sm">
        {t("logTargetHit", {
          price: formatUsd(log.trigger?.targetPrice ?? log.price),
        })}
      </span>
    ) : (
      <span className="flex items-baseline gap-3">
        <span
          className={cn("text-base font-semibold tabular-nums", TONE_TEXT[tone])}
        >
          {signed(log.deltaPercent, `${Math.abs(log.deltaPercent).toFixed(2)}%`)}
        </span>
        <span className="text-sm tabular-nums text-text-muted">
          {formatUsd(log.price)}
        </span>
      </span>
    ),
  };
}
