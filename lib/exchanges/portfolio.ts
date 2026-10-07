import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { D, sum } from "./decimal";
import { exchangesEnabled, HYPERCORE_CHAINS } from "./config";

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
  return createHash("sha256")
    .update([...sources].sort().join("|"))
    .digest("hex");
}

export async function getCapitalOverview(userId: string) {
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
              include: {
                balances: true,
                _count: { select: { positions: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.wallet.findMany({
          where: { userId },
          include: { balances: { where: { isHidden: false, isSpam: false } } },
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
    c.accounts.map((a) => {
      // Until HyperCore migration is complete, legacy wallet balances remain authoritative.
      const included =
        c.exchange !== "hyperliquid" || c.hyperCoreMigratedAt !== null;
      const stale =
        c.status === "PAUSED" ||
        !a.balancesAt ||
        Date.now() - a.balancesAt.getTime() >
          (a.kind === "spot" ? 300_000 : 90_000) ||
        (a.kind !== "spot" &&
          (!a.positionsAt || Date.now() - a.positionsAt.getTime() > 90_000));
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
        complete: a.complete && !a.errorCode,
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
      (c) => c.accounts.length > 0 && ["ACTIVE", "PAUSED"].includes(c.status),
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

export async function saveCapitalSnapshot(userId: string) {
  if (!exchangesEnabled(userId)) return;
  const overview = await getCapitalOverview(userId);
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
  await prisma.portfolioCapitalSnapshot.upsert({
    where: { userId_bucket: { userId, bucket } },
    create: { userId, bucket, ...data },
    update: data,
  });
}
export async function getCapitalHistory(userId: string, days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  const [snapshots, events] = await Promise.all([
    prisma.portfolioCapitalSnapshot.findMany({
      where: { userId, bucket: { gte: since } },
      orderBy: { bucket: "asc" },
    }),
    prisma.capitalEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { kind: true, label: true, createdAt: true },
    }),
  ]);
  const first = snapshots[0],
    last = snapshots.at(-1);
  const comparable =
    !!first &&
    !!last &&
    snapshots.length >= 2 &&
    snapshots.every((s) => s.complete && s.sourceSet === first.sourceSet);
  // Bound chart payloads without deleting the underlying five-minute observations.
  const stride = Math.max(1, Math.ceil(snapshots.length / 720));
  const displayed = snapshots.filter(
    (s, i) =>
      i % stride === 0 ||
      i === snapshots.length - 1 ||
      (i > 0 && s.sourceSet !== snapshots[i - 1]?.sourceSet),
  );
  return {
    points: displayed.map((s) => ({
      timestamp: s.bucket.getTime(),
      totalUsd: s.totalUsd.toFixed(),
      walletsUsd: s.walletsUsd.toFixed(),
      exchangesUsd: s.exchangesUsd.toFixed(),
      complete: s.complete,
      sourceSet: s.sourceSet,
    })),
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
