"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { trimTrailing } from "@/lib/utils/trim";

const TWEEN_MS = 350;

/**
 * Eases a shown number toward a new value instead of jumping. The first value is shown as is, and
 * so is every change for people who prefer reduced motion.
 */
function useTween(target: number | null): number | null {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (
      target === null ||
      from === null ||
      from === target ||
      !Number.isFinite(from) ||
      !Number.isFinite(target) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - progress) ** 3;
      current.current = progress === 1 ? target : from + (target - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function parse(value: string | null | undefined) {
  return value == null ? null : Number(value);
}

export function Money({
  value,
  signed = false,
}: {
  value: string | null | undefined;
  signed?: boolean;
}) {
  const locale = useLocale();
  const shown = useTween(parse(value));
  return (
    <span className="tabular-nums">
      {shown == null
        ? "—"
        : new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
            signDisplay: signed ? "exceptZero" : "auto",
          }).format(shown)}
    </span>
  );
}
export function Quantity({
  value,
  maximumFractionDigits,
}: {
  value: string | null | undefined;
  maximumFractionDigits?: number;
}) {
  const locale = useLocale();
  const shown = useTween(parse(value));
  return (
    <span className="tabular-nums">
      {shown == null
        ? "—"
        : new Intl.NumberFormat(locale, {
            ...(maximumFractionDigits === undefined
              ? { maximumSignificantDigits: 10 }
              : { maximumFractionDigits }),
          }).format(shown)}
    </span>
  );
}
/** A fraction shown as a percentage ("+3.45%"), eased like the other numbers. */
export function Percent({
  fraction,
  digits = 2,
  signed = false,
  trim = false,
}: {
  fraction: number | null;
  digits?: number;
  signed?: boolean;
  trim?: boolean;
}) {
  const shown = useTween(fraction);
  if (shown == null || !Number.isFinite(shown)) return <>—</>;
  let text = (shown * 100).toFixed(digits);
  if (trim) text = trimTrailing(trimTrailing(text, "0"), ".");
  return (
    <>
      {signed && shown > 0 ? "+" : ""}
      {text}%
    </>
  );
}
export function Updated({ value }: { value: string | null }) {
  const locale = useLocale(),
    t = useTranslations("Exchanges");
  return (
    <span className="text-xs text-text-muted">
      {value ? new Date(value).toLocaleString(locale) : t("neverUpdated")}
    </span>
  );
}
export function ExchangeErrorNotice({
  code,
}: {
  code: string | null | undefined;
}) {
  const t = useTranslations("Exchanges");
  // Coins without a USD price are simply left out of totals; the asset list
  // has its own toggle for them, so this is not shown as a problem.
  if (!code || code === "UNPRICED_ASSETS") return null;
  if (code === "SPOT_UNAVAILABLE")
    return (
      <p className="text-sm text-text-muted">{t("errors.SPOT_UNAVAILABLE")}</p>
    );
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-text"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      {t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.UNAVAILABLE")}
    </p>
  );
}
export function ConnectionStatus({
  status: raw,
  errorCode,
}: {
  status: string;
  errorCode?: string | null;
}) {
  const t = useTranslations("Exchanges");
  // Partial only because some coins have no price: the account itself is fine.
  const status =
    raw === "PARTIAL" && errorCode === "UNPRICED_ASSETS" ? "ACTIVE" : raw;
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs lg:px-3 lg:text-sm ${status === "ACTIVE" ? "bg-success/10 text-success" : "bg-surface-2 text-text-muted"}`}
    >
      {t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}
    </span>
  );
}
