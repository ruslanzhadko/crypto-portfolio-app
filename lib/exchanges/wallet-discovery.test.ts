import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  active: vi.fn(),
  connections: vi.fn(),
  existing: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  enqueue: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("./aster", () => ({ readAsterBalance: mocks.read }));
vi.mock("./queue", () => ({ enqueue: mocks.enqueue }));
vi.mock("@/lib/db/prisma", () => {
  const db = {
    wallet: { findUnique: mocks.wallet, findFirst: mocks.active },
    exchangeConnection: {
      findMany: mocks.connections,
      findUnique: mocks.existing,
      count: mocks.count,
      create: mocks.create,
    },
    $queryRaw: mocks.lock,
  };
  return {
    prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) },
  };
});
import { hasPublicAsterAccount, syncWalletExchanges } from "./wallet-discovery";
const address = `0x${"a".repeat(40)}`;
const publicAccount = {
  result: {
    address,
    accountPrivacy: "disabled",
    perpAssets: [{ walletBalance: "10" }],
    positions: [],
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EXCHANGES_ENABLED", "true");
  vi.stubEnv("EXCHANGES_PILOT_USER_IDS", "");
  mocks.wallet.mockResolvedValue({
    id: "wallet",
    userId: "user",
    address,
    network: "EVM",
    isActive: true,
    label: "Main",
    user: { isBlocked: false },
  });
  mocks.active.mockResolvedValue({ id: "wallet" });
  mocks.connections.mockResolvedValue([]);
  mocks.existing.mockResolvedValue(null);
  mocks.count.mockResolvedValue(0);
  mocks.create.mockResolvedValue({ id: "aster" });
  mocks.read.mockResolvedValue(publicAccount);
});
describe("wallet exchange discovery", () => {
  it("discovers Aster for an existing wallet and queues its first sync", async () => {
    await syncWalletExchanges("wallet");
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: "wallet",
        userId: "user",
        exchange: "aster",
        externalAccountId: address,
      }),
    });
    expect(mocks.enqueue).toHaveBeenCalledWith("aster", expect.anything());
  });
  it("refreshes existing Aster and Hyperliquid without another probe", async () => {
    mocks.connections.mockResolvedValue([
      { id: "aster", exchange: "aster", status: "ACTIVE" },
      { id: "hyper", exchange: "hyperliquid", status: "PARTIAL" },
    ]);
    await syncWalletExchanges("wallet");
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves explicit disconnect", async () => {
    mocks.connections.mockResolvedValue([
      { id: "aster", exchange: "aster", status: "DISCONNECTED" },
    ]);
    await syncWalletExchanges("wallet");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not mistake a private/default account for an empty public account", async () => {
    mocks.read.mockResolvedValue({
      result: { address, accountPrivacy: "enabled" },
    });
    await expect(syncWalletExchanges("wallet")).rejects.toMatchObject({
      code: "PRIVATE_ACCOUNT",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      hasPublicAsterAccount(
        {
          result: {
            address,
            accountPrivacy: "disabled",
            perpAssets: [],
            positions: [],
          },
        },
        address,
      ),
    ).toBe(false);
  });
  it("detects positions even with no collateral balance and rejects another address", () => {
    const payload = {
      result: {
        address,
        accountPrivacy: "disabled",
        perpAssets: [],
        positions: [
          { tradingProduct: "perps", positions: [{ positionAmount: "-1" }] },
        ],
      },
    };
    expect(hasPublicAsterAccount(payload, address)).toBe(true);
    expect(() =>
      hasPublicAsterAccount(payload, `0x${"b".repeat(40)}`),
    ).toThrow();
  });
  it("checks limits and rechecks wallet activity after the public request", async () => {
    mocks.count.mockResolvedValue(10);
    await syncWalletExchanges("wallet");
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.active.mockResolvedValue(null);
    await syncWalletExchanges("wallet");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("makes no exchange calls while the rollout is disabled", async () => {
    vi.stubEnv("EXCHANGES_ENABLED", "false");
    await syncWalletExchanges("wallet");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.connections).not.toHaveBeenCalled();
  });
});
