import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { claimJob, enqueue as enqueueJob } from "./queue";
import {
  commitResult,
  earliestDueAt,
  pullForward,
} from "./worker";
import { nextIdleSlot } from "./config";
import { prepareWalletConnections } from "./wallet-schema";
import {
  getCapitalOverview,
  getCapitalHistory,
  saveCapitalSnapshot,
} from "./portfolio";
import type { SyncResult } from "./types";
import { resetDepositWatch, takeDueDeposits } from "./deposit-watch";
// Explicit opt-in; refuse a production/remote target even if configured accidentally.
const url = process.env.EXCHANGE_TEST_DATABASE_URL;
const enabled =
  !!url &&
  new URL(url).hostname === "127.0.0.1" &&
  new URL(url).pathname === "/exchange_test" &&
  process.env.DATABASE_URL === url;
if (process.env.CI && !enabled)
  throw new Error(
    "CI requires an explicit isolated localhost /exchange_test database",
  );
const userId = "exchange-integration-user";
async function enqueue(connectionId: string) {
  await enqueueJob(connectionId);
  // Lease tests need a due job independently of host/Docker clock skew.
  await prisma.exchangeSyncJob.update({
    where: { connectionId },
    data: { dueAt: new Date(0) },
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
          funding: {
            amount: "-1.25",
            realizedPnl: "7.5",
            tradingFees: "0.25",
            breakEvenPrice: "69960",
            nextRate: "0.0001",
            nextTime: Date.now() + 3600_000,
            since: 1700000000000,
            updatedAt: 1700001000000,
            status: "complete",
          },
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
  it("replaces Bitget capital pools on full mode changes and preserves Classic spot during positions polling", async () => {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bitget", label: "Bitget modes" },
    });
    const base = snapshot.accounts[0]!;
    const spot = {
      ...base,
      accountKey: "spot",
      kind: "spot" as const,
      mode: "spot",
      equityUsd: "100",
      positions: [],
    };
    const futures = {
      ...base,
      accountKey: "futures:usdt-futures",
      kind: "futures" as const,
      mode: "classic",
      equityUsd: "120",
    };
    async function commit(
      accounts: SyncResult["accounts"],
      failedAccounts: SyncResult["failedAccounts"] = [],
    ) {
      await enqueue(c.id);
      const job = (await claimJob())!;
      expect(
        await commitResult(
          c.id,
          1,
          job.token,
          { accounts, failedAccounts },
          new Date(),
        ),
      ).toBe(true);
      return prisma.exchangeAccount.findMany({
        where: { connectionId: c.id },
        orderBy: { accountKey: "asc" },
      });
    }
    expect((await commit([spot, futures])).map((a) => a.accountKey)).toEqual([
      futures.accountKey,
      "spot",
    ]);
    expect((await commit([futures])).map((a) => a.accountKey)).toEqual([
      futures.accountKey,
      "spot",
    ]);
    expect(
      (
        await commit(
          [futures],
          [{ accountKey: "spot", kind: "spot", errorCode: "UNAVAILABLE" }],
        )
      ).map((a) => a.accountKey),
    ).toEqual([futures.accountKey, "spot"]);
    const unified = { ...base, equityUsd: "220" };
    const pools = await commit([unified]);
    expect(pools.map((a) => a.accountKey)).toEqual(["unified"]);
    expect(pools[0]!.equityUsd?.toString()).toBe("220");
    expect((await commit([spot, futures])).map((a) => a.accountKey)).toEqual([
      futures.accountKey,
      "spot",
    ]);
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("does not count unsupported Aster spot as stale and removes its old placeholder after futures sync", async () => {
    const c = await prisma.exchangeConnection.create({
      data: {
        userId,
        exchange: "aster",
        label: "Aster futures",
        status: "PARTIAL",
        errorCode: "SPOT_UNAVAILABLE",
      },
    });
    await prisma.exchangeAccount.create({
      data: {
        connectionId: c.id,
        accountKey: "spot",
        kind: "spot",
        mode: "unknown",
        complete: false,
        errorCode: "SPOT_UNAVAILABLE",
      },
    });
    expect((await getCapitalOverview(userId)).accounts).toHaveLength(0);
    const futures: SyncResult = {
      accounts: [
        {
          ...snapshot.accounts[0]!,
          accountKey: "futures",
          kind: "futures",
          mode: "public-wallet",
        },
      ],
      failedAccounts: [],
    };
    await enqueue(c.id);
    const job = (await claimJob())!;
    expect(await commitResult(c.id, 1, job.token, futures, new Date())).toBe(
      true,
    );
    const stored = await prisma.exchangeConnection.findUniqueOrThrow({
      where: { id: c.id },
      include: { accounts: true },
    });
    expect(stored.status).toBe("ACTIVE");
    expect(stored.errorCode).toBeNull();
    expect(stored.accounts.map((a) => a.kind)).toEqual(["futures"]);
    const overview = await getCapitalOverview(userId);
    expect(overview.complete).toBe(true);
    expect(overview.stale).toBe(false);
    // Genuine incomplete futures valuation must still surface as incomplete.
    await enqueue(c.id);
    const next = (await claimJob())!;
    await commitResult(
      c.id,
      1,
      next.token,
      {
        ...futures,
        accounts: [
          {
            ...futures.accounts[0]!,
            complete: false,
            equityUsd: null,
            errorCode: "UNPRICED_ASSETS",
          },
        ],
      },
      new Date(),
    );
    expect((await getCapitalOverview(userId)).complete).toBe(false);
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("asks for a wallet sync when stablecoins grow on a connection, not on the first sync or unchanged balances", async () => {
    resetDepositWatch();
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bybit", label: "Deposit test" },
    });
    const commitWith = async (usdt: string) => {
      await enqueue(c.id);
      const job = (await claimJob())!;
      const result: SyncResult = {
        ...snapshot,
        accounts: snapshot.accounts.map((a) => ({
          ...a,
          balances: a.balances.map((b) => ({ ...b, total: usdt, usdValue: usdt })),
        })),
      };
      expect(await commitResult(c.id, 1, job.token, result, new Date())).toBe(true);
    };
    await commitWith("1000");
    expect(takeDueDeposits()).toEqual([]);
    await commitWith("1000");
    expect(takeDueDeposits()).toEqual([]);
    await commitWith("2210");
    expect(takeDueDeposits()).toEqual([{ userId, walletId: null }]);
    resetDepositWatch();
    await prisma.exchangeSyncJob.delete({ where: { connectionId: c.id } });
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
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
    expect(
      (
        await prisma.exchangePosition.findFirst({
          where: { account: { connectionId: c.id } },
        })
      )?.funding,
    ).toMatchObject({
      amount: "-1.25",
      realizedPnl: "7.5",
      tradingFees: "0.25",
      breakEvenPrice: "69960",
      nextRate: "0.0001",
      status: "complete",
    });
    expect(overview.unrealizedPnlUsd).toBe("-100");
    // A connection-level warning from another account must not leak onto a healthy account.
    await prisma.exchangeConnection.update({
      where: { id: c.id },
      data: { status: "PARTIAL", errorCode: "UNPRICED_ASSETS" },
    });
    expect(
      (await getCapitalOverview(userId)).accounts.find(
        (a) => a.connectionId === c.id,
      )?.errorCode,
    ).toBeNull();
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
  it("allows independent Aster and Hyperliquid links for one wallet", async () => {
    // Existing installations have the old one-exchange-per-wallet index.
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeConnection_walletId_key" ON "ExchangeConnection"("walletId")`;
    await prepareWalletConnections();
    await prepareWalletConnections();
    const wallet = await prisma.wallet.create({
      data: { userId, network: "EVM", address: `0x${"c".repeat(40)}` },
    });
    const data = { userId, walletId: wallet.id, label: "Wallet exchange" };
    await prisma.exchangeConnection.create({
      data: { ...data, exchange: "aster" },
    });
    await prisma.exchangeConnection.create({
      data: { ...data, exchange: "hyperliquid" },
    });
    expect(
      await prisma.exchangeConnection.count({ where: { walletId: wallet.id } }),
    ).toBe(2);
    await expect(
      prisma.exchangeConnection.create({
        data: { ...data, exchange: "aster" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.exchangeConnection.deleteMany({
      where: { walletId: wallet.id },
    });
    await prisma.wallet.delete({ where: { id: wallet.id } });
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
  it("thins long capital history in SQL but keeps ends and composition changes", async () => {
    await prisma.portfolioCapitalSnapshot.deleteMany({ where: { userId } });
    const start = Date.now() - 1500 * 300_000;
    await prisma.portfolioCapitalSnapshot.createMany({
      data: Array.from({ length: 1500 }, (_, i) => ({
        userId,
        bucket: new Date(start + i * 300_000),
        totalUsd: String(1000 + i),
        walletsUsd: "1000",
        exchangesUsd: String(i),
        sourceSet: "same",
        complete: true,
        sources: [{ id: "x", kind: "wallet", valueUsd: "1" }],
      })),
    });
    const history = await getCapitalHistory(userId, 7);
    expect(history.points.length).toBeLessThanOrEqual(751);
    expect(history.points[0]?.totalUsd).toBe("1000");
    expect(history.points.at(-1)?.totalUsd).toBe("2499");
    expect(history.changeUsd).toBe("1499");

    // A composition change is always visible and disables the change figure.
    await prisma.portfolioCapitalSnapshot.update({
      where: { userId_bucket: { userId, bucket: new Date(start + 701 * 300_000) } },
      data: { sourceSet: "changed" },
    });
    const changed = await getCapitalHistory(userId, 7);
    expect(changed.points.some((p) => p.sourceSet === "changed")).toBe(true);
    expect(changed.changeUsd).toBeNull();
    await prisma.portfolioCapitalSnapshot.deleteMany({ where: { userId } });
  });
  it("schedules idle users for the next slot and pulls them forward when they return", async () => {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bybit", label: "Idle slot" },
    });
    await enqueue(c.id);
    const job = (await claimJob())!;
    const slot = nextIdleSlot();
    expect(
      await commitResult(c.id, 1, job.token, snapshot, new Date(), slot),
    ).toBe(true);
    const idle = await prisma.exchangeSyncJob.findUniqueOrThrow({
      where: { connectionId: c.id },
    });
    expect(Math.abs(idle.dueAt.getTime() - slot.getTime())).toBeLessThan(5000);
    expect((await earliestDueAt())!.getTime()).toBeLessThanOrEqual(
      idle.dueAt.getTime(),
    );

    // A job in rate-limit backoff keeps its delay; a scheduled one runs now.
    await pullForward([userId]);
    const pulled = await prisma.exchangeSyncJob.findUniqueOrThrow({
      where: { connectionId: c.id },
    });
    expect(pulled.dueAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const backoff = new Date(Date.now() + 600_000);
    await prisma.exchangeSyncJob.update({
      where: { connectionId: c.id },
      data: { dueAt: backoff, attempts: 2 },
    });
    await pullForward([userId]);
    expect(
      (
        await prisma.exchangeSyncJob.findUniqueOrThrow({
          where: { connectionId: c.id },
        })
      ).dueAt.getTime(),
    ).toBe(backoff.getTime());
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
  it("keeps an idle user's transient retry until the next slot", async () => {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: "bybit", label: "Idle retry" },
    });
    await enqueue(c.id);
    const job = (await claimJob())!;
    const slot = nextIdleSlot();
    const failed: SyncResult = {
      accounts: [],
      failedAccounts: [
        { accountKey: "unified", kind: "unified", errorCode: "UNAVAILABLE" },
      ],
    };
    expect(
      await commitResult(c.id, 1, job.token, failed, new Date(), slot),
    ).toBe(true);
    const retry = await prisma.exchangeSyncJob.findUniqueOrThrow({
      where: { connectionId: c.id },
    });
    expect(retry.attempts).toBe(1);
    expect(retry.dueAt.getTime()).toBeGreaterThanOrEqual(slot.getTime() - 1000);
    await prisma.exchangeConnection.delete({ where: { id: c.id } });
  });
});
