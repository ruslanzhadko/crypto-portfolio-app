import { prisma } from "@/lib/db/prisma";
import { readAsterBalance } from "./aster";
import { record, records } from "./adapters";
import { D, requiredDecimal } from "./decimal";
import { exchangesEnabled, MAX_CONNECTIONS } from "./config";
import { enqueue } from "./queue";
import { ExchangeError } from "./types";

/** Private/default accounts cannot be distinguished from absent accounts. */
export function hasPublicAsterAccount(
  payload: unknown,
  address: string,
): boolean {
  const envelope = record(payload);
  if (envelope.error) throw new ExchangeError("UNAVAILABLE");
  const result = record(envelope.result);
  if (
    typeof result.address !== "string" ||
    result.address.toLowerCase() !== address.toLowerCase()
  )
    throw new ExchangeError("INVALID_RESPONSE");
  if (result.accountPrivacy === "enabled")
    throw new ExchangeError("PRIVATE_ACCOUNT");
  if (result.accountPrivacy !== "disabled")
    throw new ExchangeError("INVALID_RESPONSE");
  return (
    records(result.perpAssets).some(
      (asset) => !new D(requiredDecimal(asset.walletBalance)).isZero(),
    ) ||
    records(result.positions).some(
      (group) =>
        group.tradingProduct === "perps" &&
        records(group.positions).some(
          (position) =>
            !new D(requiredDecimal(position.positionAmount)).isZero(),
        ),
    )
  );
}

/** Called on every wallet sync, including previously added wallets. */
export async function syncWalletExchanges(walletId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: {
      id: true,
      userId: true,
      address: true,
      label: true,
      network: true,
      isActive: true,
      user: { select: { isBlocked: true } },
    },
  });
  if (
    !wallet ||
    !wallet.isActive ||
    wallet.user.isBlocked ||
    wallet.network !== "EVM" ||
    !exchangesEnabled(wallet.userId)
  )
    return;
  const connections = await prisma.exchangeConnection.findMany({
    where: { walletId },
  });
  for (const connection of connections) {
    if (connection.status !== "DISCONNECTED") await enqueue(connection.id);
  }
  // An explicit disconnect is an opt-out; do not recreate it on sync.
  if (connections.some((connection) => connection.exchange === "aster")) return;
  if (
    !hasPublicAsterAccount(
      await readAsterBalance(wallet.address),
      wallet.address,
    )
  )
    return;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${wallet.userId} FOR UPDATE`;
    const active = await tx.wallet.findFirst({
      where: {
        id: walletId,
        userId: wallet.userId,
        isActive: true,
        user: { isBlocked: false },
      },
    });
    if (!active) return;
    const existing = await tx.exchangeConnection.findUnique({
      where: { walletId_exchange: { walletId, exchange: "aster" } },
    });
    if (existing) return;
    const count = await tx.exchangeConnection.count({
      where: {
        userId: wallet.userId,
        status: { not: "DISCONNECTED" },
        exchange: { not: "hyperliquid" },
      },
    });
    if (count >= MAX_CONNECTIONS) return;
    const connection = await tx.exchangeConnection.create({
      data: {
        walletId,
        userId: wallet.userId,
        exchange: "aster",
        externalAccountId: wallet.address.toLowerCase(),
        label:
          wallet.label ??
          `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
      },
    });
    await enqueue(connection.id, tx);
  });
}
