import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { summarizePositions } from "@/lib/exchanges/position-summary";
import { settlementPrices } from "@/lib/exchanges/pricing";
import { compareMarginReturn } from "@/lib/exchanges/position-sort";
import {
  exchangeGuard,
  exchangeJson,
  failure,
  safeApiFailure,
} from "@/lib/exchanges/api";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const guard = await exchangeGuard();
    if (!guard.ok) return guard.response;
    const parsed = z
      .object({
        exchange: z
          .enum(["binance", "bybit", "gate", "okx", "hyperliquid"])
          .optional(),
        connectionId: z.string().max(100).optional(),
        coin: z.string().max(40).optional(),
        side: z.enum(["long", "short"]).optional(),
        sort: z
          .enum(["size", "pnl", "pnlAsc", "roe", "roeAsc", "symbol"])
          .default("size"),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return failure("BAD_REQUEST");
    const q = parsed.data;
    const where: Prisma.ExchangePositionWhereInput = {
      ...(q.side ? { side: q.side } : {}),
      ...(q.coin ? { base: { contains: q.coin, mode: "insensitive" } } : {}),
      account: {
        connection: {
          userId: guard.user.id,
          status: { not: "DISCONNECTED" },
          ...(q.exchange ? { exchange: q.exchange } : {}),
          ...(q.connectionId ? { id: q.connectionId } : {}),
        },
      },
    };
    const orderBy: Prisma.ExchangePositionOrderByWithRelationInput =
      q.sort === "pnl" || q.sort === "pnlAsc"
        ? {
            unrealizedPnlUsd: {
              sort: q.sort === "pnlAsc" ? "asc" : "desc",
              nulls: "last",
            },
          }
        : q.sort === "size"
          ? { notionalUsd: { sort: "desc", nulls: "last" } }
          : { symbol: "asc" };
    const [positions, summaryRows, connections, heartbeat] =
      await prisma.$transaction([
        prisma.exchangePosition.findMany({
          where,
          orderBy: [orderBy, { id: "asc" }],
          skip: q.sort.startsWith("roe") ? undefined : (q.page - 1) * q.limit,
          take: q.sort.startsWith("roe") ? undefined : q.limit,
          include: {
            account: {
              select: {
                kind: true,
                errorCode: true,
                connection: {
                  select: {
                    id: true,
                    exchange: true,
                    label: true,
                    status: true,
                  },
                },
              },
            },
          },
        }),
        prisma.exchangePosition.findMany({
          where,
          select: {
            side: true,
            settle: true,
            notionalUsd: true,
            unrealizedPnlUsd: true,
            funding: true,
          },
        }),
        prisma.exchangeConnection.findMany({
          where: {
            userId: guard.user.id,
            status: { not: "DISCONNECTED" },
            ...(q.exchange ? { exchange: q.exchange } : {}),
            ...(q.connectionId ? { id: q.connectionId } : {}),
          },
          select: {
            id: true,
            status: true,
            errorCode: true,
            positionsAt: true,
          },
        }),
        prisma.exchangeWorkerLease.findFirst({
          where: {
            name: { startsWith: "worker:" },
            expiresAt: { gt: new Date() },
          },
          select: { name: true },
        }),
      ]);
    // Derived return must be sorted before pagination, with missing margins last.
    const visible = q.sort.startsWith("roe")
      ? positions
          .sort((a, b) => compareMarginReturn(a, b, q.sort === "roeAsc"))
          .slice((q.page - 1) * q.limit, q.page * q.limit)
      : positions;
    return exchangeJson({
      positions: visible.map(({ account, ...p }) => ({
        ...p,
        account: account.kind,
        connection: account.connection,
        errorCode: account.errorCode,
        stale:
          !["ACTIVE", "PARTIAL"].includes(account.connection.status) ||
          Date.now() - p.updatedAt.getTime() > 90_000,
      })),
      total: summaryRows.length,
      summary: summarizePositions(
        summaryRows,
        summaryRows.length
          ? await settlementPrices().catch(() => new Map<string, string>())
          : new Map<string, string>(),
      ),
      page: q.page,
      limit: q.limit,
      workerOnline: !!heartbeat,
      connectionCount: connections.length,
      incomplete: connections.some(
        (c) =>
          (c.status !== "ACTIVE" &&
            !(c.status === "PARTIAL" && c.errorCode === "UNPRICED_ASSETS")) ||
          !c.positionsAt ||
          Date.now() - c.positionsAt.getTime() > 90_000,
      ),
    });
  } catch (e) {
    return safeApiFailure(e);
  }
}
