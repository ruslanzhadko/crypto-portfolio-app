import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptCredentials, encryptCredentials } from "./crypto";
import {
  exchangesEnabled,
  BALANCE_INTERVAL_MS,
  HYPERCORE_CHAINS,
  POSITION_INTERVAL_MS,
  LEASE_MS,
} from "./config";
import { createTransport } from "./transport";
import { BinanceAdapter, BybitAdapter } from "./adapters";
import { GateAdapter } from "./gate";
import { OkxAdapter } from "./okx";
import { BingxAdapter } from "./bingx";
import { HyperliquidAdapter } from "./hyperliquid";
import { AsterAdapter } from "./aster";
import { settlementPrices } from "./pricing";
import { claimJob, enqueue, retryDelay } from "./queue";
import {
  ExchangeError,
  safeError,
  type ExchangeAdapter,
  type SyncResult,
} from "./types";
import { saveCapitalSnapshot } from "./portfolio";

const clients = new Map<
  string,
  { version: number; adapter: ExchangeAdapter; touched: number }
>();
export async function evictClients() {
  for (const [id, entry] of clients)
    if (Date.now() - entry.touched > 300_000) {
      clients.delete(id);
      await entry.adapter.close().catch(() => {});
    }
}
export async function discoverHyperliquid() {
  const wallets = await prisma.wallet.findMany({
    where: {
      network: "EVM",
      isActive: true,
      user: { isBlocked: false },
      exchangeConnections: { none: { exchange: "hyperliquid" } },
      balances: { some: { chainName: { in: HYPERCORE_CHAINS } } },
    },
    select: { id: true, userId: true, label: true, address: true },
  });
  for (const wallet of wallets) {
    if (!exchangesEnabled(wallet.userId)) continue;
    await prisma.$transaction(async (tx) => {
      const c = await tx.exchangeConnection.upsert({
        where: {
          walletId_exchange: { walletId: wallet.id, exchange: "hyperliquid" },
        },
        update: {},
        create: {
          userId: wallet.userId,
          walletId: wallet.id,
          exchange: "hyperliquid",
          label:
            wallet.label ??
            `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
        },
      });
      await enqueue(c.id, tx);
    });
  }
}

export async function commitResult(
  connectionId: string,
  version: number,
  token: string,
  result: SyncResult,
  observedAt: Date,
) {
  return prisma.$transaction(
    async (tx) => {
      // Lock in the same order as credential replacement/disconnect.
      await tx.$queryRaw`SELECT id FROM "ExchangeConnection" WHERE id = ${connectionId} FOR UPDATE`;
      const c = await tx.exchangeConnection.findUnique({
        where: { id: connectionId },
        include: { user: { select: { isBlocked: true } } },
      });
      const job = await tx.exchangeSyncJob.findUnique({
        where: { connectionId },
      });
      if (
        !c ||
        c.user.isBlocked ||
        c.credentialVersion !== version ||
        !["PENDING", "ACTIVE", "PARTIAL", "ERROR"].includes(c.status) ||
        job?.leaseToken !== token ||
        !job.leaseUntil ||
        job.leaseUntil < new Date()
      )
        return false;
      const activeKeys = result.accounts.map((a) => a.accountKey);
      // Remove only the never-synced placeholder created by the old Aster adapter.
      if (c.exchange === "aster")
        await tx.exchangeAccount.deleteMany({
          where: {
            connectionId,
            kind: "spot",
            errorCode: "SPOT_UNAVAILABLE",
            balancesAt: null,
          },
        });
      // Hyperliquid can change account mode. Remove obsolete pools only after a full successful response.
      if (c.exchange === "hyperliquid" && result.failedAccounts.length === 0)
        await tx.exchangeAccount.deleteMany({
          where: { connectionId, accountKey: { notIn: activeKeys } },
        });
      for (const account of result.accounts) {
        const { balances, positions, ...data } = account;
        const stored = await tx.exchangeAccount.upsert({
          where: {
            connectionId_accountKey: {
              connectionId,
              accountKey: account.accountKey,
            },
          },
          create: {
            ...data,
            connectionId,
            balancesAt: observedAt,
            positionsAt: positions ? observedAt : null,
          },
          update: {
            ...data,
            balancesAt: observedAt,
            ...(positions ? { positionsAt: observedAt } : {}),
          },
        });
        await tx.exchangeBalance.deleteMany({
          where: { accountId: stored.id },
        });
        if (balances.length)
          await tx.exchangeBalance.createMany({
            data: balances.map((b) => ({ ...b, accountId: stored.id })),
          });
        if (positions) {
          await tx.exchangePosition.deleteMany({
            where: { accountId: stored.id },
          });
          if (positions.length)
            await tx.exchangePosition.createMany({
              data: positions.map((p) => ({
                ...p,
                accountId: stored.id,
                updatedAt: observedAt,
              })),
            });
        }
      }
      for (const failed of result.failedAccounts)
        await tx.exchangeAccount.upsert({
          where: {
            connectionId_accountKey: {
              connectionId,
              accountKey: failed.accountKey,
            },
          },
          create: {
            connectionId,
            accountKey: failed.accountKey,
            kind: failed.kind,
            mode: "unknown",
            complete: false,
            errorCode: failed.errorCode,
          },
          update: { complete: false, errorCode: failed.errorCode },
        });
      const complete =
        !result.failedAccounts.length &&
        result.accounts.every((a) => a.complete);
      const hasPositions = result.accounts.some(
        (a) => a.positions !== undefined,
      );
      const hasSpot = result.accounts.some((a) => a.kind !== "futures");
      const hyperReady = c.exchange === "hyperliquid" && complete;
      const first = !c.lastSuccessAt && result.accounts.length > 0;
      await tx.exchangeConnection.update({
        where: { id: connectionId },
        data: {
          status: complete ? "ACTIVE" : "PARTIAL",
          errorCode:
            result.failedAccounts[0]?.errorCode ??
            result.accounts.find((a) => a.errorCode)?.errorCode ??
            null,
          ...(result.accounts.length ? { lastSuccessAt: observedAt } : {}),
          ...(hasPositions ? { positionsAt: observedAt } : {}),
          ...(hasSpot ? { balancesAt: observedAt } : {}),
          ...(hyperReady && !c.hyperCoreMigratedAt
            ? { hyperCoreMigratedAt: observedAt }
            : {}),
          ...(result.externalAccountId
            ? { externalAccountId: result.externalAccountId }
            : {}),
        },
      });
      if (first)
        await tx.capitalEvent.create({
          data: {
            userId: c.userId,
            sourceId: c.id,
            label: c.label,
            kind: "CONNECTED",
          },
        });
      const transientFailure = result.failedAccounts.find((a) =>
        ["RATE_LIMIT", "UNAVAILABLE", "INVALID_RESPONSE"].includes(a.errorCode),
      );
      await tx.exchangeSyncJob.update({
        where: { connectionId },
        data: {
          leaseToken: null,
          leaseUntil: null,
          attempts: transientFailure ? job.attempts + 1 : 0,
          forceBalances: false,
          dueAt: new Date(
            Date.now() +
              (transientFailure
                ? retryDelay(
                    job.attempts,
                    transientFailure.errorCode === "RATE_LIMIT",
                  )
                : POSITION_INTERVAL_MS),
          ),
        },
      });
      return true;
    },
    { timeout: 20_000 },
  );
}

export async function runOneJob(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false;
  const c = await prisma.exchangeConnection.findUnique({
    where: { id: job.connectionId },
    include: { wallet: true },
  });
  if (!c || !exchangesEnabled(c.userId)) {
    await prisma.exchangeSyncJob.updateMany({
      where: { connectionId: job.connectionId, leaseToken: job.token },
      data: {
        dueAt: new Date(Date.now() + 60_000),
        leaseToken: null,
        leaseUntil: null,
      },
    });
    return true;
  }
  const started = Date.now();
  await prisma.exchangeConnection.updateMany({
    where: { id: c.id, credentialVersion: c.credentialVersion },
    data: { lastAttemptAt: new Date() },
  });
  let heartbeatBusy = false;
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    void prisma.exchangeSyncJob
      .updateMany({
        where: { connectionId: c.id, leaseToken: job.token },
        data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      })
      .catch(() => {})
      .finally(() => {
        heartbeatBusy = false;
      });
  }, 30_000);
  try {
    if (["hyperliquid", "aster"].includes(c.exchange) && !c.wallet?.isActive)
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    let cached = clients.get(c.id);
    if (cached && cached.version !== c.credentialVersion) {
      await cached.adapter.close().catch(() => {});
      clients.delete(c.id);
      cached = undefined;
    }
    if (!cached) {
      let adapter: ExchangeAdapter;
      if (["hyperliquid", "aster"].includes(c.exchange)) {
        if (!c.wallet?.isActive) throw new ExchangeError("UNSUPPORTED_ACCOUNT");
        adapter =
          c.exchange === "aster"
            ? new AsterAdapter(c.wallet.address, settlementPrices)
            : new HyperliquidAdapter(c.wallet.address, settlementPrices);
      } else {
        if (
          !c.credentials ||
          !["binance", "bybit", "gate", "okx", "bingx"].includes(c.exchange)
        )
          throw new ExchangeError("INVALID_KEY");
        const credentials = decryptCredentials(c.credentials, c.userId, c.id);
        const transport = createTransport(
          c.exchange as "binance" | "bybit" | "gate" | "okx" | "bingx",
          credentials,
        );
        adapter =
          c.exchange === "bingx"
            ? new BingxAdapter(
                transport.request,
                settlementPrices,
                transport.close,
              )
            : c.exchange === "gate"
              ? new GateAdapter(
                  transport.request,
                  settlementPrices,
                  credentials.apiKey,
                  transport.close,
                )
              : c.exchange === "okx"
                ? new OkxAdapter(
                    transport.request,
                    settlementPrices,
                    transport.close,
                  )
                : c.exchange === "binance"
                  ? new BinanceAdapter(
                      transport.request,
                      settlementPrices,
                      transport.close,
                    )
                  : new BybitAdapter(
                      transport.request,
                      settlementPrices,
                      transport.close,
                    );
        // Re-encrypt with the active key version; old versions remain available during rollout.
        const encrypted = encryptCredentials(credentials, c.userId, c.id);
        await prisma.exchangeConnection.updateMany({
          where: {
            id: c.id,
            credentialVersion: c.credentialVersion,
            credentials: c.credentials,
          },
          data: { credentials: encrypted },
        });
      }
      cached = { version: c.credentialVersion, adapter, touched: Date.now() };
      clients.set(c.id, cached);
    }
    cached.touched = Date.now();
    const identity = await cached.adapter.verify();
    const result = await cached.adapter.fetch(
      job.forceBalances ||
        !c.balancesAt ||
        Date.now() - c.balancesAt.getTime() >= BALANCE_INTERVAL_MS,
    );
    result.externalAccountId =
      identity.externalAccountId ?? result.externalAccountId;
    if (
      await commitResult(
        c.id,
        c.credentialVersion,
        job.token,
        result,
        new Date(),
      )
    ) {
      await prisma.exchangeSyncRun.create({
        data: {
          connectionId: c.id,
          status: result.failedAccounts.length ? "PARTIAL" : "SUCCESS",
          errorCode: result.failedAccounts[0]?.errorCode,
          durationMs: Date.now() - started,
        },
      });
      await saveCapitalSnapshot(c.userId);
    }
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
        ? "DUPLICATE_ACCOUNT"
        : safeError(error);
    const terminal = [
      "INVALID_KEY",
      "UNSAFE_KEY",
      "UNSUPPORTED_ACCOUNT",
      "DUPLICATE_ACCOUNT",
      "CONFIGURATION",
    ].includes(code);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ExchangeConnection" WHERE id = ${c.id} FOR UPDATE`;
      const claimed = await tx.exchangeSyncJob.updateMany({
        where: { connectionId: c.id, leaseToken: job.token },
        data: {
          leaseToken: null,
          leaseUntil: null,
          attempts: { increment: 1 },
          dueAt: new Date(
            Date.now() + retryDelay(job.attempts, code === "RATE_LIMIT"),
          ),
        },
      });
      if (!claimed.count) return;
      await tx.exchangeConnection.updateMany({
        where: {
          id: c.id,
          credentialVersion: c.credentialVersion,
          status: { in: ["PENDING", "ACTIVE", "PARTIAL", "ERROR"] },
        },
        data: {
          status: terminal
            ? code === "UNSUPPORTED_ACCOUNT"
              ? "UNSUPPORTED"
              : "INVALID_KEY"
            : "ERROR",
          errorCode: code,
        },
      });
      await tx.exchangeSyncRun.create({
        data: {
          connectionId: c.id,
          status: "ERROR",
          errorCode: code,
          durationMs: Date.now() - started,
        },
      });
    });
    const old = clients.get(c.id);
    clients.delete(c.id);
    await old?.adapter.close().catch(() => {});
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

export async function workerHeartbeat(owner: string) {
  await prisma.exchangeWorkerLease.upsert({
    where: { name: `worker:${owner}` },
    create: {
      name: `worker:${owner}`,
      owner,
      expiresAt: new Date(Date.now() + 90_000),
    },
    update: {
      heartbeatAt: new Date(),
      expiresAt: new Date(Date.now() + 90_000),
    },
  });
}
export const newWorkerId = () => randomUUID();
