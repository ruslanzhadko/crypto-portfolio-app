import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { claimJob, enqueue as enqueueJob } from "./queue";
import { commitResult } from "./worker";
import {
  getCapitalOverview,
  getCapitalHistory,
  saveCapitalSnapshot,
} from "./portfolio";
import type { SyncResult } from "./types";
// Explicit opt-in; refuse a production/remote target even if configured accidentally.
const url = process.env.EXCHANGE_TEST_DATABASE_URL;
const enabled =
  !!url &&
  new URL(url).hostname === "127.0.0.1" &&
  new URL(url).pathname === "/exchange_test" &&
  process.env.DATABASE_URL === url;
const userId = "exchange-integration-user";
async function enqueue(connectionId: string) {
  await enqueueJob(connectionId);
  // Lease tests need a due job independently of host/Docker clock skew.
  await prisma.exchangeSyncJob.update({
    where: { connectionId }, data: { dueAt: new Date(0) },
  });
}
const snapshot: SyncResult = {
  accounts: [
    {
      accountKey: "unified",
      kind: "unified",
      mode: "cross",
      equityUsd: "900",
      availableUsd: "100",
      unrealizedPnlUsd: "-100",
      complete: true,
      errorCode: null,
      balances: [
        {
          assetId: "bybit:USDT",
          symbol: "USDT",
          total: "1000",
          free: null,
          locked: null,
          debt: null,
          priceUsd: "1",
          usdValue: "1000",
        },
      ],
      positions: [
        {
          positionKey: "BTCUSDT:1",
          symbol: "BTCUSDT",
          base: "BTC",
          settle: "USDT",
          side: "long",
          contracts: "0.1",
          contractSize: "1",
          baseSize: "0.1",
          notionalUsd: "10000",
          entryPrice: "100000",
          markPrice: "99000",
          liquidationPrice: null,
          leverage: "10",
          marginMode: "cross",
          margin: "1000",
          unrealizedPnl: "-100",
          unrealizedPnlUsd: "-100",
        },
      ],
    },
  ],
  failedAccounts: [],
};

describe.skipIf(!enabled)("exchange database integration", () => {
  beforeAll(async () => {
    process.env.EXCHANGES_ENABLED = "true";
    process.env.EXCHANGES_PILOT_USER_IDS = "";
    // This dedicated test database is also used by the browser suite.
    await prisma.exchangeSyncJob.updateMany({
      where: { connection: { userId: { not: userId } } },
      data: { dueAt: new Date(Date.now() + 86400000) },
    });
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: "exchange-integration@test.local" },
      update: {},
    });
    await prisma.exchangeConnection.deleteMany({ where: { userId } });
    await prisma.portfolioCapitalSnapshot.deleteMany({ where: { userId } });
    await prisma.exchangeWorkerLease.upsert({
      where: { name: "worker:integration" },
      create: {
        name: "worker:integration",
        owner: "integration",
        expiresAt: new Date(Date.now() + 300000),
      },
      update: { expiresAt: new Date(Date.now() + 300000) },
    });
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.exchangeWorkerLease.deleteMany({
      where: { name: "worker:integration" },
    });
    await prisma.$disconnect();
  });
  it("leases one job to one worker and fences stale writers after credential changes", async () => {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bybit", label: "Fence test" },
    });
    await enqueue(c.id);
    const jobs = await Promise.all([claimJob(), claimJob()]);
    expect(jobs.filter(Boolean)).toHaveLength(1);
    const job = jobs.find(Boolean)!;
    await prisma.exchangeConnection.update({
      where: { id: c.id },
      data: { credentialVersion: 2 },
    });
    expect(await commitResult(c.id, 1, job.token, snapshot, new Date())).toBe(
      false,
    );
    expect(
      await prisma.exchangeAccount.count({ where: { connectionId: c.id } }),
    ).toBe(0);
    await prisma.exchangeSyncJob.delete({ where: { connectionId: c.id } });
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("reclaims an expired lease and does not let the previous worker overwrite it", async () => {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bybit", label: "Lease recovery" },
    });
    await enqueue(c.id);
    const old = (await claimJob())!;
    await prisma.exchangeSyncJob.update({
      where: { connectionId: c.id },
      data: { leaseUntil: new Date(0) },
    });
    const next = (await claimJob())!;
    expect(next.token).not.toBe(old.token);
    expect(await commitResult(c.id, 1, old.token, snapshot, new Date())).toBe(
      false,
    );
    expect(await commitResult(c.id, 1, next.token, snapshot, new Date())).toBe(
      true,
    );
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("preserves positions on partial failure, counts equity once, then closes positions on verified empty response", async () => {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bybit", label: "Accounting" },
    });
    await enqueue(c.id);
    let job = (await claimJob())!;
    expect(await commitResult(c.id, 1, job.token, snapshot, new Date())).toBe(
      true,
    );
    const overview = await getCapitalOverview(userId);
    expect(overview.totalUsd).toBe("900");
    expect(overview.positionCount).toBe(1);
    expect(overview.unrealizedPnlUsd).toBe("-100");
    await enqueue(c.id);
    job = (await claimJob())!;
    expect(
      await commitResult(
        c.id,
        1,
        job.token,
        {
          accounts: [],
          failedAccounts: [
            {
              accountKey: "unified",
              kind: "unified",
              errorCode: "UNAVAILABLE",
            },
          ],
        },
        new Date(),
      ),
    ).toBe(true);
    expect(
      await prisma.exchangePosition.count({
        where: { account: { connectionId: c.id } },
      }),
    ).toBe(1);
    expect((await getCapitalOverview(userId)).complete).toBe(false);
    await enqueue(c.id);
    job = (await claimJob())!;
    expect(
      await commitResult(
        c.id,
        1,
        job.token,
        {
          ...snapshot,
          accounts: [{ ...snapshot.accounts[0]!, positions: [] }],
        },
        new Date(),
      ),
    ).toBe(true);
    expect(
      await prisma.exchangePosition.count({
        where: { account: { connectionId: c.id } },
      }),
    ).toBe(0);
    await saveCapitalSnapshot(userId);
    await saveCapitalSnapshot(userId);
    expect(
      await prisma.portfolioCapitalSnapshot.count({ where: { userId } }),
    ).toBe(1);
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("excludes migrated legacy HyperCore balances while preserving the stored rows", async () => {
    const wallet = await prisma.wallet.create({
      data: { userId, network: "EVM", address: `0x${"a".repeat(40)}` },
    });
    await prisma.tokenBalance.create({
      data: {
        walletId: wallet.id,
        tokenSymbol: "USD",
        tokenName: "Legacy equity",
        chainName: "hypercore-perps",
        tokenAddress: "perp-equity",
        balance: 900,
        usdValue: 900,
      },
    });
    const c = await prisma.exchangeConnection.create({
      data: {
        userId,
        exchange: "hyperliquid",
        label: "HyperCore",
        walletId: wallet.id,
      },
    });
    await enqueue(c.id);
    const job = (await claimJob())!;
    await commitResult(c.id, 1, job.token, snapshot, new Date());
    const overview = await getCapitalOverview(userId);
    expect(overview.walletsUsd).toBe("0");
    expect(overview.totalUsd).toBe("900");
    expect(
      await prisma.tokenBalance.count({ where: { walletId: wallet.id } }),
    ).toBe(1);
    await prisma.exchangeConnection.update({
      where: { id: c.id },
      data: { status: "DISCONNECTED" },
    });
    expect((await getCapitalOverview(userId)).totalUsd).toBe("0");
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("never reports a composition change as investment profit", async () => {
    await prisma.portfolioCapitalSnapshot.deleteMany({ where: { userId } });
    for (const [minutes, value, sourceSet] of [
      [10, "100", "wallets"],
      [5, "1000", "wallets-and-exchange"],
    ] as const)
      await prisma.portfolioCapitalSnapshot.create({
        data: {
          userId,
          bucket: new Date(Date.now() - minutes * 60000),
          totalUsd: value,
          walletsUsd: "100",
          exchangesUsd: String(Number(value) - 100),
          sourceSet,
          complete: true,
          sources: [],
        },
      });
    expect((await getCapitalHistory(userId, 1)).changeUsd).toBeNull();
  });
});
