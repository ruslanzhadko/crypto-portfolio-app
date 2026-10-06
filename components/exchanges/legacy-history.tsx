"use client";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
export function LegacyHistory({ totalUsd }: { totalUsd: number }) {
  const t = useTranslations("Exchanges");
  const visibility = useCallback(() => {}, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("legacyHistory")}</h1>
      <p className="text-sm text-text-muted">{t("legacyNote")}</p>
      <PortfolioChart
        totalUsd={totalUsd}
        priceChange24h={0}
        priceChange24hUsd={0}
        onVisibilityChange={visibility}
      />
    </div>
  );
}
