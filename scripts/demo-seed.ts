/**
 * Creates or refreshes the read-only demo account (README: DEMO_USER_ID). Idempotent: running it
 * again keeps the same user and replaces only its sample data. It never touches other users.
 *
 *   DATABASE_URL=... npx tsx scripts/demo-seed.ts --yes
 *
 * Prints DEMO_USER_ID for Vercel and the worker env.
 */
import { prisma } from "../lib/db/prisma";
import { DEMO_WALLETS } from "../lib/demo/wallets";
import { DEMO_EXCHANGES } from "../lib/demo/exchange";

const DEMO_EMAIL = "demo@cryptoportfolio.demo";

async function main() {
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "?";
    }
  })();
  if (!process.argv.includes("--yes")) {
    console.log(
      `Would seed the demo account in the database at ${host}. Re-run with --yes.`,
    );
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: "Demo",
      positionAlerts: {
        opened: true,
        closed: true,
        liquidation: true,
        pnlSign: false,
        liquidationPercent: 5,
        excludedConnections: [],
      },
    },
    update: {},
    select: { id: true, role: true, passwordHash: true },
  });
  // The demo login refuses anything but a plain user without a password.
  if (user.role !== "USER" || user.passwordHash)
    throw new Error("The demo email belongs to a real account");

  // Wallets: made-up addresses, fixed coins; prices come from TokenPrice when present.
  const prices = new Map(
    (
      await prisma.tokenPrice.findMany({
        select: {
          tokenId: true,
          currentPrice: true,
          priceChange24h: true,
          logoUrl: true,
        },
      })
    ).map((p) => [p.tokenId, p]),
  );
  for (const demo of DEMO_WALLETS) {
    const wallet = await prisma.wallet.upsert({
      where: {
        userId_address_network: {
          userId: user.id,
          address: demo.address,
          network: demo.network,
        },
      },
      create: {
        userId: user.id,
        address: demo.address,
        network: demo.network,
        label: demo.label,
        lastSyncAt: new Date(),
      },
      update: { label: demo.label, isActive: true, lastSyncAt: new Date() },
    });
    await prisma.tokenBalance.deleteMany({ where: { walletId: wallet.id } });
    await prisma.tokenBalance.createMany({
      data: demo.tokens.map((t) => {
        const price = prices.get(t.coingeckoId);
        const priceUsd = price?.currentPrice ?? 0;
        return {
          walletId: wallet.id,
          tokenSymbol: t.symbol,
          tokenName: t.name,
          chainName: t.chainName,
          tokenAddress: t.address ?? "",
          decimals: t.decimals,
          balance: t.balance,
          priceUsd,
          usdValue: t.balance * priceUsd,
          priceChange24h: price?.priceChange24h ?? 0,
          logoUrl: price?.logoUrl ?? null,
          coingeckoId: t.coingeckoId,
        };
      }),
    });
  }

  // Exchanges: no keys; the worker reads them through the demo adapter.
  for (const [exchange, demo] of Object.entries(DEMO_EXCHANGES)) {
    const existing = await prisma.exchangeConnection.findFirst({
      where: { userId: user.id, exchange },
    });
    const connection = existing
      ? await prisma.exchangeConnection.update({
          where: { id: existing.id },
          data: { label: demo.label, status: "PENDING", errorCode: null },
        })
      : await prisma.exchangeConnection.create({
          data: {
            userId: user.id,
            exchange,
            label: demo.label,
            externalAccountId: `demo-${exchange}`,
          },
        });
    await prisma.exchangeSyncJob.upsert({
      where: { connectionId: connection.id },
      create: { connectionId: connection.id },
      update: {
        dueAt: new Date(),
        attempts: 0,
        leaseToken: null,
        leaseUntil: null,
      },
    });
  }

  // Price triggers and a few past alerts, so the Notifications page is not empty.
  await prisma.priceTrigger.deleteMany({ where: { userId: user.id } });
  const now = Date.now();
  const btcPrice = prices.get("bitcoin")?.currentPrice ?? 100_000;
  await prisma.priceTrigger.createMany({
    data: [
      {
        userId: user.id,
        tokenId: "bitcoin",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        triggerType: "PRICE_TARGET",
        targetPrice: Math.round(btcPrice * 1.08),
        direction: "UP",
      },
      {
        userId: user.id,
        tokenId: "ethereum",
        tokenSymbol: "ETH",
        tokenName: "Ethereum",
        triggerType: "PERCENT",
        threshold: 5,
        interval: 60,
      },
      {
        userId: user.id,
        tokenId: "solana",
        tokenSymbol: "SOL",
        tokenName: "Solana",
        triggerType: "PERCENT",
        threshold: 7,
        interval: 240,
      },
    ],
  });
  await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
  await prisma.notificationLog.createMany({
    data: [
      {
        userId: user.id,
        tokenSymbol: "ETH",
        message: "ETH +5.2% за 1 ч",
        deltaPercent: 5.2,
        price: prices.get("ethereum")?.currentPrice ?? 4000,
        status: "site",
        sentAt: new Date(now - 5 * 3600_000),
      },
      {
        userId: user.id,
        tokenSymbol: "DOGE",
        message: "Позиция открыта",
        deltaPercent: 0,
        price: 0,
        status: "site",
        sentAt: new Date(now - 26 * 3600_000),
        kind: "opened",
        details: {
          exchange: "bybit",
          label: "Bybit Demo",
          side: "long",
          leverage: "5",
          sizeUsd: "1450",
        },
      },
      {
        userId: user.id,
        tokenSymbol: "LINK",
        message: "Позиция закрыта",
        deltaPercent: 0,
        price: 0,
        status: "site",
        sentAt: new Date(now - 30 * 3600_000),
        kind: "closed",
        details: {
          exchange: "binance",
          label: "Binance Demo",
          side: "long",
          leverage: "10",
          sizeUsd: "2100",
          pnlUsd: 84.37,
          approximate: false,
          includesCosts: true,
          durationMs: 19 * 3600_000 + 40 * 60_000,
        },
      },
    ],
  });

  // Capital history (30 days) is drawn by the worker around its first complete snapshot.
  await prisma.portfolioCapitalSnapshot.deleteMany({
    where: { userId: user.id },
  });

  console.log(`Demo account ready in ${host}.`);
  console.log(`DEMO_USER_ID=${user.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
