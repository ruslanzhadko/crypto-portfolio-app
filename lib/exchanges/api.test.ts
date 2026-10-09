import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  enqueue: vi.fn(),
  deleteJobs: vi.fn(),
  event: vi.fn(),
  getSession: vi.fn(),
  query: vi.fn(),
  accountDelete: vi.fn(),
  wallet: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("@/lib/api/auth-guard", () => ({ requireUser: mocks.guard }));
vi.mock("@/lib/auth", () => ({ auth: mocks.getSession }));
vi.mock("./queue", () => ({ enqueue: mocks.enqueue }));
vi.mock("@/lib/db/prisma", () => {
  const db = {
    exchangeConnection: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
      count: vi.fn().mockResolvedValue(0),
    },
    exchangeSyncJob: { deleteMany: mocks.deleteJobs },
    wallet: { findFirst: mocks.wallet },
    capitalEvent: { create: mocks.event },
    exchangeAccount: { deleteMany: mocks.accountDelete },
    authRateLimit: { upsert: vi.fn().mockResolvedValue({ attempts: 1 }) },
    user: { findUnique: vi.fn().mockResolvedValue({ passwordHash: null }) },
    $queryRaw: mocks.query,
  };
  return {
    prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) },
  };
});
import {
  createConnection,
  getConnection,
  changeConnection,
  readBody,
} from "./api";
import { decryptCredentials } from "./crypto";
const request = (method: string, body?: unknown, origin = "https://app.test") =>
  new NextRequest("https://app.test/api/exchanges", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXCHANGES_ENABLED", "true");
  vi.stubEnv("EXCHANGES_PILOT_USER_IDS", "");
  vi.stubEnv(
    "EXCHANGE_ENCRYPTION_KEYS",
    JSON.stringify({ 1: Buffer.alloc(32, 1).toString("base64") }),
  );
  vi.stubEnv(
    "EXCHANGE_FINGERPRINT_KEY",
    "stable-test-fingerprint-secret-32-characters",
  );
  mocks.guard.mockResolvedValue({ ok: true, user: { id: "user-a" } });
  mocks.findFirst.mockResolvedValue({
    id: "connection",
    userId: "user-a",
    exchange: "bybit",
    status: "ACTIVE",
    label: "Main",
  });
  mocks.create.mockResolvedValue({
    id: "new",
    exchange: "bybit",
    keyMask: "••••1234",
    status: "PENDING",
  });
  mocks.getSession.mockResolvedValue({
    user: { id: "user-a", authenticatedAt: 0 },
  });
});
describe("exchange API authorization and secrets", () => {
  it("links Aster only to an active EVM wallet owned by the user without credentials", async () => {
    mocks.wallet.mockResolvedValue({
      id: "wallet",
      address: `0x${"a".repeat(40)}`,
    });
    mocks.findUnique.mockResolvedValue(null);
    const response = await createConnection(
      request("POST", {
        exchange: "aster",
        label: "Aster",
        walletId: "wallet",
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.wallet.mock.calls[0]![0].where).toEqual({
      id: "wallet",
      userId: "user-a",
      isActive: true,
      network: "EVM",
    });
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({
      exchange: "aster",
      walletId: "wallet",
      userId: "user-a",
    });
    expect(mocks.create.mock.calls[0]![0].data.credentials).toBeUndefined();
    expect(mocks.enqueue).toHaveBeenCalled();
  });
  it("rejects a foreign wallet and duplicate wallet links before writes", async () => {
    mocks.wallet.mockResolvedValue(null);
    const body = { exchange: "aster", label: "Aster", walletId: "foreign" };
    expect((await createConnection(request("POST", body))).status).toBe(404);
    mocks.wallet.mockResolvedValue({
      id: "wallet",
      address: `0x${"a".repeat(40)}`,
    });
    mocks.findUnique.mockResolvedValue({ id: "linked", status: "ACTIVE" });
    expect((await createConnection(request("POST", body))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it.each(["gate", "okx", "bingx"])(
    "accepts %s and encrypts all required credentials",
    async (exchange) => {
      const credentials = {
        apiKey: "key-test-1234",
        secret: "private-secret-test",
        ...(exchange === "okx" ? { passphrase: "private-passphrase" } : {}),
      };
      const response = await createConnection(
        request("POST", { exchange, label: "New exchange", ...credentials }),
      );
      expect(response.status).toBe(201);
      const { data, select } = mocks.create.mock.calls[0]![0];
      expect(data.exchange).toBe(exchange);
      expect(decryptCredentials(data.credentials, "user-a", data.id)).toEqual(
        credentials,
      );
      expect(data.credentials).not.toContain("private-passphrase");
      expect(select.credentials).toBeUndefined();
      expect(JSON.stringify(await response.json())).not.toContain(
        "private-passphrase",
      );
    },
  );
  it("requires OKX passphrase on both create and replacement before writes", async () => {
    const credentials = {
      apiKey: "key-test-1234",
      secret: "private-secret-test",
    };
    expect(
      (
        await createConnection(
          request("POST", { exchange: "okx", label: "OKX", ...credentials }),
        )
      ).status,
    ).toBe(400);
    mocks.findFirst.mockResolvedValue({ id: "connection", exchange: "okx" });
    expect(
      (
        await changeConnection(
          request("POST", credentials),
          "connection",
          "credentials",
        )
      ).status,
    ).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before database writes", async () => {
    const response = await createConnection(
      request("POST", {}, "https://attacker.test"),
    );
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("always scopes lookups to the current user, even when the id exists for somebody else", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await getConnection("other-user-connection")).status).toBe(404);
    expect(mocks.findFirst.mock.calls[0]![0].where).toEqual({
      id: "other-user-connection",
      userId: "user-a",
    });
  });
  it("returns only selected metadata and queues verification without upstream calls", async () => {
    const response = await createConnection(
      request("POST", {
        exchange: "bybit",
        label: "Main",
        apiKey: "key-test-1234",
        secret: "private-secret-test",
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.enqueue).toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(
      "private-secret-test",
    );
    const call = mocks.create.mock.calls[0]![0];
    expect(call.data.credentials).not.toContain("private-secret-test");
    expect(call.select.credentials).toBeUndefined();
  });
  it("requires fresh authentication for credential replacement", async () => {
    const response = await changeConnection(
      request("POST", {
        apiKey: "key-test-1234",
        secret: "private-secret-test",
      }),
      "connection",
      "credentials",
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "REAUTH_REQUIRED" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("deletes credentials and jobs and increments the writer fence on disconnect", async () => {
    const response = await changeConnection(
      request("DELETE"),
      "connection",
      "disconnect",
    );
    expect(response.status).toBe(200);
    expect(mocks.deleteJobs).toHaveBeenCalledWith({
      where: { connectionId: "connection" },
    });
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({
      credentials: null,
      status: "DISCONNECTED",
      credentialVersion: { increment: 1 },
    });
    expect(mocks.event).toHaveBeenCalled();
    expect(mocks.accountDelete).not.toHaveBeenCalled();
  });
  it("does not reveal upstream or database errors", async () => {
    mocks.findFirst.mockRejectedValue(new Error("secret=PRIVATE"));
    expect(await (await getConnection("c")).json()).toEqual({
      error: { code: "INTERNAL_ERROR" },
    });
  });
  it("rejects oversized bodies and unexpected fields", async () => {
    expect(
      await readBody(request("POST", { padding: "x".repeat(9000) })),
    ).toBeNull();
    expect(
      (
        await createConnection(
          request("POST", {
            exchange: "bybit",
            label: "Main",
            apiKey: "key-test-1234",
            secret: "private-secret-test",
            endpoint: "https://evil.test",
          }),
        )
      ).status,
    ).toBe(400);
  });
});
