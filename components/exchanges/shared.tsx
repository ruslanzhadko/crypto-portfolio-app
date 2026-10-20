"use client";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

export function Money({
  value,
  signed = false,
}: {
  value: string | null | undefined;
  signed?: boolean;
}) {
  const locale = useLocale();
  return (
    <span className="tabular-nums">
      {value == null
        ? "—"
        : new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
            signDisplay: signed ? "exceptZero" : "auto",
          }).format(Number(value))}
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
  return (
    <span className="tabular-nums">
      {value == null
        ? "—"
        : new Intl.NumberFormat(locale, {
            ...(maximumFractionDigits === undefined
              ? { maximumSignificantDigits: 10 }
              : { maximumFractionDigits }),
          }).format(Number(value))}
    </span>
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
      className={`rounded-md px-2 py-1 text-xs ${status === "ACTIVE" ? "bg-success/10 text-success" : "bg-surface-2 text-text-muted"}`}
    >
      {t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}
    </span>
  );
}
