import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Open positions | trading statistics, on the Positions page instead of a menu item of its own. */
export function PositionsTabs({ active }: { active: "open" | "stats" }) {
  const t = useTranslations("TradingStats");
  return (
    <nav aria-label={t("tabs")} className="flex rounded-lg border border-border bg-surface p-0.5 text-xs sm:text-sm">
      {(["open", "stats"] as const).map((tab) => (
        <Link
          key={tab}
          href={tab === "stats" ? "/positions?tab=stats" : "/positions"}
          aria-current={active === tab ? "page" : undefined}
          className={`rounded-md px-2.5 py-1 transition-colors sm:px-3 ${active === tab ? "bg-primary text-white" : "text-text-muted hover:text-text"}`}
        >
          {t(tab === "open" ? "tabOpen" : "tabStats")}
        </Link>
      ))}
    </nav>
  );
}
