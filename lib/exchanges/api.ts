import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/api/auth-guard";
import { auth } from "@/lib/auth";
import { exchangesEnabled, MAX_CONNECTIONS } from "./config";
import {
  credentialsSchema,
  credentialFingerprint,
  encryptCredentials,
  maskKey,
} from "./crypto";
import { enqueue } from "./queue";
import { ExchangeError } from "./types";

export function exchangeJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(code: string, status = 400) {
  return exchangeJson({ error: { code } }, status);
}
export function safeApiFailure(error: unknown) {
  if (error instanceof ExchangeError) return failure(error.code, 503);
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  )
    return failure("DUPLICATE_ACCOUNT", 409);
  return failure("INTERNAL_ERROR", 500);
}
export async function exchangeGuard(req?: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (!exchangesEnabled(guard.user.id))
    return { ok: false as const, response: failure("NOT_FOUND", 404) };
  if (req && req.method !== "GET") {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return { ok: false as const, response: failure("FORBIDDEN", 403) };
    // Shared, atomic counter per user and action, without keys or request bodies.
    const bucket = Math.floor(Date.now() / 60_000);
    const counter = await prisma.authRateLimit.upsert({
      where: { key: `exchange:${guard.user.id}:${bucket}` },
      create: {
        key: `exchange:${guard.user.id}:${bucket}`,
        attempts: 1,
        expiresAt: new Date(Date.now() + 120_000),
      },
      update: { attempts: { increment: 1 } },
    });
    if (counter.attempts > 15)
      return { ok: false as const, response: failure("RATE_LIMIT", 429) };
  }
  return guard;
}
export async function readBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return null;
  // Bound streaming bodies too (Content-Length may be absent or forged).
  const reader = req.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
const createSchema = credentialsSchema
  .extend({
    exchange: z.enum(["bybit", "binance", "gate", "okx", "bingx"]),
    label: z.string().trim().min(1).max(80),
  })
  .strict();
export const connectionSelect = {
  id: true,
  exchange: true,
  label: true,
  status: true,
  errorCode: true,
  keyMask: true,
  balancesAt: true,
  positionsAt: true,
  lastSuccessAt: true,
  lastAttemptAt: true,
  createdAt: true,
  walletId: true,
} as const;

export async function listConnections() {
  try {
    const guard = await exchangeGuard();
    if (!guard.ok) return guard.response;
    const connections = await prisma.exchangeConnection.findMany({
      where: { userId: guard.user.id, status: { not: "DISCONNECTED" } },
      select: connectionSelect,
      orderBy: { createdAt: "desc" },
    });
    return exchangeJson({
      connections,
      workerIp: process.env.EXCHANGE_WORKER_PUBLIC_IP ?? null,
    });
  } catch (e) {
    return safeApiFailure(e);
  }
}
export async function createConnection(req: NextRequest) {
  try {
    const guard = await exchangeGuard(req);
    if (!guard.ok) return guard.response;
    const body = await readBody(req);
    const walletLink = z
      .object({
        exchange: z.literal("aster"),
        walletId: z.string().min(1).max(100),
        label: z.string().trim().min(1).max(80),
      })
      .strict()
      .safeParse(body);
    if (walletLink.success) {
      const userId = guard.user.id;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const wallet = await tx.wallet.findFirst({
          where: {
            id: walletLink.data.walletId,
            userId,
            isActive: true,
            network: "EVM",
          },
          select: { id: true, address: true },
        });
        if (!wallet) return failure("NOT_FOUND", 404);
        const existing = await tx.exchangeConnection.findUnique({
          where: {
            walletId_exchange: { walletId: wallet.id, exchange: "aster" },
          },
        });
        if (existing && existing.status !== "DISCONNECTED")
          return failure("DUPLICATE_ACCOUNT", 409);
        const count = await tx.exchangeConnection.count({
          where: {
            userId,
            status: { not: "DISCONNECTED" },
            exchange: { not: "hyperliquid" },
          },
        });
        if (count >= MAX_CONNECTIONS) return failure("CONNECTION_LIMIT", 409);
        const data = {
          label: walletLink.data.label,
          status: "PENDING",
          errorCode: null,
          externalAccountId: wallet.address.toLowerCase(),
        };
        const connection = existing
          ? await tx.exchangeConnection.update({
              where: { id: existing.id },
              data: { ...data, credentialVersion: { increment: 1 } },
              select: connectionSelect,
            })
          : await tx.exchangeConnection.create({
              data: { ...data, userId, walletId: wallet.id, exchange: "aster" },
              select: connectionSelect,
            });
        await enqueue(connection.id, tx);
        return exchangeJson({ connection }, 201);
      });
      return result;
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return failure("BAD_REQUEST");
    const { apiKey, secret, passphrase, exchange, label } = parsed.data,
      id = randomUUID(),
      userId = guard.user.id;
    if (exchange === "okx" && !passphrase) return failure("BAD_REQUEST");
    const credentials = encryptCredentials(
      { apiKey, secret, ...(exchange === "okx" ? { passphrase } : {}) },
      userId,
      id,
    );
    const fingerprint = credentialFingerprint(apiKey);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const count = await tx.exchangeConnection.count({
        where: {
          userId,
          status: { not: "DISCONNECTED" },
          exchange: { not: "hyperliquid" },
        },
      });
      if (count >= MAX_CONNECTIONS) return null;
      const c = await tx.exchangeConnection.create({
        data: {
          id,
          userId,
          exchange,
          label,
          credentials,
          keyMask: maskKey(apiKey),
          keyFingerprint: fingerprint,
        },
        select: connectionSelect,
      });
      await enqueue(id, tx);
      return c;
    });
    return result
      ? exchangeJson({ connection: result }, 201)
      : failure("CONNECTION_LIMIT", 409);
  } catch (e) {
    return safeApiFailure(e);
  }
}
export async function getConnection(id: string) {
  try {
    const guard = await exchangeGuard();
    if (!guard.ok) return guard.response;
    const connection = await prisma.exchangeConnection.findFirst({
      where: { id, userId: guard.user.id },
      select: {
        ...connectionSelect,
        runs: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            errorCode: true,
            createdAt: true,
            durationMs: true,
          },
        },
      },
    });
    return connection
      ? exchangeJson({ connection })
      : failure("NOT_FOUND", 404);
  } catch (e) {
    return safeApiFailure(e);
  }
}
export async function changeConnection(
  req: NextRequest,
  id: string,
  action: "settings" | "disconnect" | "credentials" | "sync",
) {
  try {
    const guard = await exchangeGuard(req);
    if (!guard.ok) return guard.response;
    const userId = guard.user.id;
    const existing = await prisma.exchangeConnection.findFirst({
      where: { id, userId, status: { not: "DISCONNECTED" } },
      select: { id: true, exchange: true },
    });
    if (!existing) return failure("NOT_FOUND", 404);
    let label: string | undefined,
      paused: boolean | undefined,
      replacement:
        | { credentials: string; keyMask: string; keyFingerprint: string }
        | undefined;
    if (action === "settings") {
      const parsed = z
        .object({
          label: z.string().trim().min(1).max(80).optional(),
          paused: z.boolean().optional(),
        })
        .strict()
        .safeParse(await readBody(req));
      if (!parsed.success) return failure("BAD_REQUEST");
      ({ label, paused } = parsed.data);
    }
    if (action === "credentials") {
      if (["hyperliquid", "aster"].includes(existing.exchange))
        return failure("BAD_REQUEST");
      const parsed = credentialsSchema
        .extend({ password: z.string().max(256).optional() })
        .strict()
        .safeParse(await readBody(req));
      if (!parsed.success) return failure("BAD_REQUEST");
      if (existing.exchange === "okx" && !parsed.data.passphrase)
        return failure("BAD_REQUEST");
      const session = await auth();
      const recent =
        session?.user.authenticatedAt &&
        Date.now() - session.user.authenticatedAt < 600_000;
      if (!recent) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true },
        });
        if (
          !user?.passwordHash ||
          !parsed.data.password ||
          !(await bcrypt.compare(parsed.data.password, user.passwordHash))
        )
          return failure("REAUTH_REQUIRED", 403);
      }
      replacement = {
        credentials: encryptCredentials(
          {
            apiKey: parsed.data.apiKey,
            secret: parsed.data.secret,
            ...(existing.exchange === "okx"
              ? { passphrase: parsed.data.passphrase }
              : {}),
          },
          userId,
          id,
        ),
        keyMask: maskKey(parsed.data.apiKey),
        keyFingerprint: credentialFingerprint(parsed.data.apiKey),
      };
    }
    const response = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ExchangeConnection" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const c = await tx.exchangeConnection.findFirst({
        where: { id, userId, status: { not: "DISCONNECTED" } },
      });
      if (!c) return failure("NOT_FOUND", 404);
      if (action === "sync") {
        if (["PAUSED", "INVALID_KEY", "UNSUPPORTED"].includes(c.status))
          return failure("CONNECTION_INACTIVE", 409);
        if (c.lastAttemptAt && Date.now() - c.lastAttemptAt.getTime() < 15_000)
          return failure("RATE_LIMIT", 429);
        await enqueue(id, tx);
        return exchangeJson({ queued: true }, 202);
      }
      await tx.exchangeSyncJob.deleteMany({ where: { connectionId: id } });
      if (action === "disconnect") {
        await tx.exchangeConnection.update({
          where: { id },
          data: {
            status: "DISCONNECTED",
            credentials: null,
            keyMask: null,
            keyFingerprint: null,
            externalAccountId: null,
            credentialVersion: { increment: 1 },
          },
        });
        await tx.capitalEvent.create({
          data: { userId, sourceId: id, label: c.label, kind: "DISCONNECTED" },
        });
      } else {
        if (replacement) {
          await tx.exchangeAccount.deleteMany({ where: { connectionId: id } });
          await tx.capitalEvent.create({
            data: {
              userId,
              sourceId: id,
              label: c.label,
              kind: "CREDENTIALS_CHANGED",
            },
          });
        }
        const status = replacement
          ? "PENDING"
          : paused === true
            ? "PAUSED"
            : paused === false && c.status === "PAUSED"
              ? "PENDING"
              : c.status;
        await tx.exchangeConnection.update({
          where: { id },
          data: {
            ...replacement,
            ...(label ? { label } : {}),
            status,
            ...(replacement
              ? { externalAccountId: null, errorCode: null }
              : {}),
            credentialVersion: { increment: 1 },
          },
        });
        if (["ACTIVE", "PENDING", "PARTIAL", "ERROR"].includes(status))
          await enqueue(id, tx);
      }
      return exchangeJson({ ok: true });
    });
    return response;
  } catch (e) {
    return safeApiFailure(e);
  }
}
