import { Wallet } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import {
  getDashboardSpamTokens,
  getPortfolioOverview,
} from "@/lib/services/portfolio";
import { DashboardSections } from "@/components/dashboard/dashboard-sections";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { exchangesEnabled } from "@/lib/exchanges/config";
import {
  migratedWalletIds,
  isMigratedHypercore,
} from "@/lib/exchanges/portfolio";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const exchangeFeature = exchangesEnabled(userId);
  const migrated = await migratedWalletIds(userId);

  const t = await getTranslations("Dashboard");

  const [overview, spamTokens, wallets, hiddenTokensCount, lastPriceUpdate] =
    await Promise.all([
      getPortfolioOverview(userId),
      getDashboardSpamTokens(userId),
      prisma.wallet.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          // Лише видимі токени (не-спам, не-приховані вручну) — щоб totalUsd і tokenCount
          // збігались з фільтрацією на /wallets і у дашборд-портфелі
          balances: {
            where: { isSpam: false, isHidden: false },
            select: { usdValue: true, chainName: true },
          },
          _count: {
            select: { balances: { where: { isSpam: false, isHidden: false } } },
          },
        },
      }),
      prisma.tokenBalance.count({
        where: { wallet: { userId }, isHidden: true, isSpam: false },
      }),
      prisma.tokenBalance.findFirst({
        where: { wallet: { userId }, isSpam: false },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

  const walletDtos = wallets.map((w) => ({
    id: w.id,
    address: w.address,
    network: w.network,
    label: w.label,
    lastSyncAt: w.lastSyncAt?.toISOString() ?? null,
    totalUsd: w.balances
      .filter((b) => !isMigratedHypercore(w.id, b.chainName, migrated))
      .reduce((s, b) => s + b.usdValue, 0),
    tokenCount: w.balances.filter(
      (b) => !isMigratedHypercore(w.id, b.chainName, migrated),
    ).length,
  }));

  const latestSyncAt = wallets.reduce<Date | null>((latest, w) => {
    if (!w.lastSyncAt) return latest;
    if (!latest) return w.lastSyncAt;
    return w.lastSyncAt > latest ? w.lastSyncAt : latest;
  }, null);

  if (overview.walletCount === 0 && !exchangeFeature) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold tracking-tight md:text-3xl">
          {t("pageTitle")}
        </h1>
        <EmptyState
          icon={Wallet}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild>
              <Link href="/wallets">{t("addWalletButton")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <DashboardSections
      pageTitle={t("pageTitle")}
      exchangesEnabled={exchangeFeature}
      overview={overview}
      spamTokens={spamTokens}
      wallets={walletDtos}
      hiddenTokensCount={hiddenTokensCount}
      lastPriceUpdateAt={lastPriceUpdate?.updatedAt?.toISOString() ?? null}
      latestSyncAt={latestSyncAt?.toISOString() ?? null}
    />
  );
}
