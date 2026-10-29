import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { PositionsPage } from "@/components/exchanges/positions-page";
import { PositionsTabs } from "@/components/exchanges/positions-tabs";
import { TradingStats } from "@/components/exchanges/trading-stats";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id || !exchangesEnabled(session.user.id)) notFound();
  const { tab } = await searchParams;
  if (tab === "stats") {
    const t = await getTranslations("Exchanges");
    return (
      <section className="min-w-0 space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">{t("positions")}</h1>
          <PositionsTabs active="stats" />
        </div>
        <TradingStats />
      </section>
    );
  }
  return <PositionsPage tabs={<PositionsTabs active="open" />} />;
}
