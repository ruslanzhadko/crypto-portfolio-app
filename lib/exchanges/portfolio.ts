import { createHash } from "node:crypto";
import { isDemoUser } from "@/lib/demo/config";
import { ensureDemoHistory } from "@/lib/demo/history";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { D, sum } from "./decimal";
import { exchangesEnabled, HYPERCORE_CHAINS, staleLimits } from "./config";
import { STABLECOINS } from "./deposit-watch";
import { markTransfers, type TransferInput } from "@/lib/portfolio/capital-transfers";

export async function migratedWalletIds(
  userId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<string[]> {
  if (!exchangesEnabled(userId)) return [];
  const rows = await db.exchangeConnection.findMany({
    where: {
      userId,
      hyperCoreMigratedAt: { not: null },
      walletId: { not: null },
    },
    select: { walletId: true },
  });
  return rows.flatMap((r) => (r.walletId ? [r.walletId] : []));
}
export function isMigratedHypercore(
  walletId: string,
  chain: string,
  migrated: string[],
): boolean {
  return migrated.includes(walletId) && HYPERCORE_CHAINS.includes(chain);
}
export function sourceSetHash(sources: string[]): string {
  return (
    createHash("sha256")
      // Code-unit order, as stored hashes were made with the default sort.
      .update(
        [...sources].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join("|"),
      )
      .digest("hex")
  );
}

export type OverviewOptions = {
  /** Accept data from the last idle slot (viewer just arrived, or idle-slot snapshot). */
  relaxed?: boolean;
};

export async function getCapitalOverview(
  userId: string,
  { relaxed = false }: OverviewOptions = {},
) {
  const limits = staleLimits(relaxed);
  const [connections, wallets, migrated, heartbeat] = await prisma.$transaction(
    async (tx) =>
      Promise.all([
        tx.exchangeConnection.findMany({
          where: { userId, status: { not: "DISCONNECTED" } },
          select: {
            id: true,
            label: true,
            exchange: true,
            status: true,
            errorCode: true,
            balancesAt: true,
            positionsAt: true,
            hyperCoreMigratedAt: true,
            accounts: {
              select: {
                id: true,
                kind: true,
                mode: true,
                equityUsd: true,
                availableUsd: true,
                unrealizedPnlUsd: true,
                complete: true,
                errorCode: true,
                balancesAt: true,
                positionsAt: true,
                balances: {
                  select: {
                    id: true,
                    assetId: true,
                    symbol: true,
                    total: true,
                    free: true,
                    locked: true,
                    debt: true,
                    priceUsd: true,
                    usdValue: true,
                  },
                },
                _count: { select: { positions: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        // Only what the capital totals need: full balance rows are large.
        tx.wallet.findMany({
          where: { userId },
          select: {
            id: true,
            label: true,
            address: true,
            lastSyncAt: true,
            balances: {
              where: { isHidden: false, isSpam: false },
              select: { chainName: true, usdValue: true },
            },
          },
        }),
        migratedWalletIds(userId, tx),
        tx.exchangeWorkerLease.findFirst({
          where: {
            name: { startsWith: "worker:" },
            expiresAt: { gt: new Date() },
          },
          orderBy: { heartbeatAt: "desc" },
          select: { heartbeatAt: true },
        }),
      ]),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const walletSources = wallets.map((w) => ({
    id: w.id,
    label: w.label ?? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
    valueUsd: sum(
      w.balances
        .filter((b) => !isMigratedHypercore(w.id, b.chainName, migrated))
        .map((b) => String(b.usdValue)),
    ),
    updatedAt: w.lastSyncAt?.toISOString() ?? null,
    kind: "wallet" as const,
  }));
  const accounts = connections.flatMap((c) =>
    c.accounts
      .filter(
        (a) =>
          !(
            c.exchange === "aster" &&
            a.kind === "spot" &&
            a.errorCode === "SPOT_UNAVAILABLE"
          ),
      )
      .map((a) => {
        // Until HyperCore migration is complete, legacy wallet balances remain authoritative.
        const included =
          c.exchange !== "hyperliquid" || c.hyperCoreMigratedAt !== null;
        const stale =
          c.status === "PAUSED" ||
          !a.balancesAt ||
          Date.now() - a.balancesAt.getTime() >
            (a.kind === "spot" ? limits.spot : limits.futures) ||
          (a.kind !== "spot" &&
            (!a.positionsAt ||
              Date.now() - a.positionsAt.getTime() > limits.futures));
        return {
          id: a.id,
          connectionId: c.id,
          label: c.label,
          exchange: c.exchange,
          kind: a.kind,
          mode: a.mode,
          equityUsd: a.equityUsd?.toFixed() ?? null,
          availableUsd: a.availableUsd?.toFixed() ?? null,
          unrealizedPnlUsd: a.unrealizedPnlUsd?.toFixed() ?? null,
          // Unpriced coins are left out of equity by design, not a gap.
          complete:
            (a.complete && !a.errorCode) ||
            (a.errorCode === "UNPRICED_ASSETS" && a.equityUsd !== null),
          stale,
          included,
          status: c.status,
          // A partial sibling account must not make this account look broken.
          errorCode: a.errorCode,
          balancesAt: a.balancesAt?.toISOString() ?? null,
          positionsAt: a.positionsAt?.toISOString() ?? null,
          balances: a.balances.map((b) => ({
            id: b.id,
            assetId: b.assetId,
            symbol: b.symbol,
            total: b.total.toFixed(),
            free: b.free?.toFixed() ?? null,
            locked: b.locked?.toFixed() ?? null,
            debt: b.debt?.toFixed() ?? null,
            priceUsd: b.priceUsd?.toFixed() ?? null,
            usdValue: b.usdValue?.toFixed() ?? null,
          })),
          positionCount: a._count.positions,
        };
      }),
  );
  const walletsUsd = sum(walletSources.map((w) => w.valueUsd));
  const exchangesUsd = sum(
    accounts.filter((a) => a.included).map((a) => a.equityUsd),
  );
  const complete =
    connections.every(
      (c) =>
        c.accounts.length > 0 &&
        (["ACTIVE", "PAUSED"].includes(c.status) ||
          (c.status === "PARTIAL" && c.errorCode === "UNPRICED_ASSETS")),
    ) &&
    accounts.every((a) => a.complete && a.included && a.equityUsd !== null);
  const sourceSet = sourceSetHash([
    ...walletSources.map((w) => `wallet:${w.id}`),
    ...accounts.filter((a) => a.included).map((a) => `exchange:${a.id}`),
  ]);
  return {
    totalUsd: new D(walletsUsd).plus(exchangesUsd).toFixed(),
    walletsUsd,
    exchangesUsd,
    unrealizedPnlUsd: accounts
      .filter((a) => a.included && a.kind !== "spot")
      .every((a) => a.unrealizedPnlUsd !== null)
      ? sum(accounts.filter((a) => a.included).map((a) => a.unrealizedPnlUsd))
      : null,
    exchangeCount: new Set(connections.map((c) => c.exchange)).size,
    connectionCount: connections.length,
    positionCount: accounts.reduce((n, a) => n + a.positionCount, 0),
    walletCount: wallets.length,
    complete,
    stale:
      accounts.some((a) => a.stale) || (connections.length > 0 && !heartbeat),
    workerOnline: !!heartbeat,
    sourceSet,
    walletSources,
    accounts,
    updatedAt: new Date().toISOString(),
  };
}
export type CapitalOverview = Awaited<ReturnType<typeof getCapitalOverview>>;

export async function saveCapitalSnapshot(
  userId: string,
  options: OverviewOptions = {},
) {
  if (!exchangesEnabled(userId)) return;
  const overview = await getCapitalOverview(userId, options);
  // Record current known value, but never call stale/partial observations complete.
  const bucket = new Date(Math.floor(Date.now() / 300_000) * 300_000);
  const data = {
    totalUsd: overview.totalUsd,
    walletsUsd: overview.walletsUsd,
    exchangesUsd: overview.exchangesUsd,
    sourceSet: overview.sourceSet,
    complete: overview.complete && !overview.stale,
    sources: [
      ...overview.walletSources.map((w) => ({
        id: w.id,
        kind: "wallet",
        valueUsd: w.valueUsd,
      })),
      ...overview.accounts
        .filter((a) => a.included)
        .map((a) => ({ id: a.id, kind: "exchange", valueUsd: a.equityUsd })),
    ],
  };
  // An included account with unknown equity would count as zero and draw a
  // false dip; skip the point while recent history exists (the next
  // successful sync fills the bucket). A lasting gap is still recorded.
  if (overview.accounts.some((a) => a.included && a.equityUsd === null)) {
    const recent = await prisma.portfolioCapitalSnapshot.findFirst({
      where: { userId, bucket: { gte: new Date(Date.now() - 2 * 3600_000) } },
      select: { id: true },
    });
    if (recent) return;
  }
  await prisma.portfolioCapitalSnapshot.upsert({
    where: { userId_bucket: { userId, bucket } },
    create: { userId, bucket, ...data },
    update: data,
  });
  // The demo account gets a month of history once, shaped around its first real point.
  if (isDemoUser(userId) && data.complete)
    await ensureDemoHistory(userId, data);
}
type HistoryRow = {
  bucket: Date;
  totalUsd: Prisma.Decimal;
  walletsUsd: Prisma.Decimal;
  exchangesUsd: Prisma.Decimal;
  complete: boolean;
  sourceSet: string;
  allComplete: boolean;
  oneSourceSet: boolean;
  n: bigint;
};
const MAX_HISTORY_POINTS = 720;

export async function getCapitalHistory(userId: string, days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  // Thin the five-minute observations in SQL, so only chart points leave the
  // database. First, last and source-set changes are always kept.
  const [snapshots, events, transfers] = await Promise.all([
    prisma.$queryRaw<HistoryRow[]>`
      SELECT bucket, "totalUsd", "walletsUsd", "exchangesUsd", complete, "sourceSet",
             "allComplete", "oneSourceSet", n
      FROM (
        SELECT bucket, "totalUsd", "walletsUsd", "exchangesUsd", complete, "sourceSet",
               row_number() OVER w - 1 AS i,
               count(*) OVER () AS n,
               lag("sourceSet") OVER w AS prev,
               bool_and(complete) OVER () AS "allComplete",
               min("sourceSet") OVER () = max("sourceSet") OVER () AS "oneSourceSet"
        FROM "PortfolioCapitalSnapshot"
        WHERE "userId" = ${userId} AND bucket >= ${since}
        WINDOW w AS (ORDER BY bucket)
      ) s
      WHERE i % GREATEST(1, CEIL(n / ${MAX_HISTORY_POINTS}::numeric)) = 0
         OR i = n - 1
         OR (prev IS NOT NULL AND prev <> "sourceSet")
      ORDER BY bucket`,
    prisma.capitalEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { kind: true, label: true, createdAt: true },
    }),
    historyTransfers(userId, since),
  ]);
  const first = snapshots[0],
    last = snapshots.at(-1);
  const comparable =
    !!first &&
    !!last &&
    Number(first.n) >= 2 &&
    first.allComplete &&
    first.oneSourceSet;
  const marked = markTransfers(
    snapshots.map((s) => ({
      timestamp: s.bucket.getTime(),
      totalUsd: s.totalUsd.toFixed(),
      walletsUsd: s.walletsUsd.toFixed(),
      exchangesUsd: s.exchangesUsd.toFixed(),
      complete: s.complete,
      sourceSet: s.sourceSet,
    })),
    transfers.rows,
    transfers.wallets,
  );
  return {
    points: marked.points,
    transfers: marked.transfers,
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    changeUsd:
      comparable && first && last
        ? new D(last.totalUsd.toFixed())
            .minus(first.totalUsd.toFixed())
            .toFixed()
        : null,
    changePercent:
      comparable && first && last && first.totalUsd.gt(0)
        ? new D(last.totalUsd.toFixed())
            .minus(first.totalUsd.toFixed())
            .div(first.totalUsd.toFixed())
            .mul(100)
            .toFixed()
        : null,
  };
}

/**
 * Completed exchange deposits and withdrawals of the period, valued at today's price (stablecoins at
 * $1, other coins at the price of the user's own holdings), with the wallets that may be their
 * other side.
 */
async function historyTransfers(userId: string, since: Date) {
  const [rows, wallets] = await Promise.all([
    prisma.exchangeTransfer.findMany({
      where: {
        connection: { userId, status: { not: "DISCONNECTED" } },
        status: "completed",
        occurredAt: { gte: since },
      },
      orderBy: { occurredAt: "asc" },
      take: 500,
      select: {
        connectionId: true,
        direction: true,
        asset: true,
        amount: true,
        txHash: true,
        address: true,
        occurredAt: true,
        connection: { select: { label: true } },
      },
    }),
    prisma.wallet.findMany({
      where: { userId },
      select: { address: true, label: true },
    }),
  ]);
  const priced = [
    ...new Set(
      rows.map((r) => r.asset.toUpperCase()).filter((a) => !STABLECOINS.has(a)),
    ),
  ];
  const prices = new Map<string, number>();
  if (priced.length) {
    const [exchange, wallet] = await Promise.all([
      prisma.exchangeBalance.findMany({
        where: {
          account: { connection: { userId } },
          symbol: { in: priced, mode: "insensitive" },
          priceUsd: { gt: 0 },
        },
        select: { symbol: true, priceUsd: true },
      }),
      prisma.tokenBalance.findMany({
        where: {
          wallet: { userId },
          tokenSymbol: { in: priced, mode: "insensitive" },
          priceUsd: { gt: 0 },
          isSpam: false,
        },
        select: { tokenSymbol: true, priceUsd: true },
      }),
    ]);
    for (const b of wallet) prices.set(b.tokenSymbol.toUpperCase(), b.priceUsd);
    for (const b of exchange)
      if (b.priceUsd) prices.set(b.symbol.toUpperCase(), Number(b.priceUsd.toFixed()));
  }
  return {
    rows: rows.map((r): TransferInput => {
      const asset = r.asset.toUpperCase();
      const price = STABLECOINS.has(asset) ? 1 : prices.get(asset);
      return {
        connectionId: r.connectionId,
        label: r.connection.label,
        direction: r.direction === "withdrawal" ? "withdrawal" : "deposit",
        asset: r.asset,
        amount: r.amount.toFixed(),
        usd: price === undefined ? null : Number(r.amount.toFixed()) * price,
        txHash: r.txHash,
        address: r.address,
        occurredAt: r.occurredAt.getTime(),
      };
    }),
    wallets: wallets.map((w) => ({
      address: w.address,
      label: w.label ?? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
    })),
  };
}
