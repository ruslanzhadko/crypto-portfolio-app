import { prisma } from "@/lib/db/prisma";
import { asterPositionGroups, readAsterBalance } from "./aster";
import { record, records } from "./adapters";
import { D, requiredDecimal } from "./decimal";
import { exchangesEnabled, MAX_CONNECTIONS } from "./config";
import { enqueue } from "./queue";
import { ExchangeError } from "./types";
import { lighterAccountState, readLighterAccounts } from "./lighter";

export type AsterAccountState = "listed" | "private" | "absent";

/**
 * Aster answers an address without a futures account with an explicit
 * "account does not exist" error, so a private account is a real account:
 * it is linked and shows how to make it readable instead of being skipped.
 * A readable account with nothing in it is not linked.
 */
export function asterAccountState(
  payload: unknown,
  address: string,
): AsterAccountState {
  const envelope = record(payload);
  if (envelope.error) {
    const message = String(record(envelope.error).message ?? "");
    if (/-40000005|account does not exist/i.test(message)) return "absent";
    throw new ExchangeError("UNAVAILABLE");
  }
  const result = record(envelope.result);
  if (
    typeof result.address !== "string" ||
    result.address.toLowerCase() !== address.toLowerCase()
  )
    throw new ExchangeError("INVALID_RESPONSE");
  if (result.accountPrivacy === "enabled") return "private";
  if (result.accountPrivacy !== "disabled")
    throw new ExchangeError("INVALID_RESPONSE");
  const funded =
    records(result.perpAssets).some(
      (asset) => !new D(requiredDecimal(asset.walletBalance)).isZero(),
    ) ||
    asterPositionGroups(result).some(
      (group) =>
        (group.tradingProduct === "perps" ||
          group.tradingProduct === "shieldmode") &&
        records(group.positions).some(
          (position) =>
            !new D(
              requiredDecimal(
                group.tradingProduct === "shieldmode"
                  ? position.qty
                  : position.positionAmount,
              ),
            ).isZero(),
        ),
    );
  return funded ? "listed" : "absent";
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
  const has = (exchange: string) => connections.some((connection) => connection.exchange === exchange);
  // Each venue is checked on its own: an Aster failure is reported after Lighter was looked at.
  let asterError: unknown = null;
  if (!has("aster")) {
    try {
      const state = asterAccountState(await readAsterBalance(wallet.address), wallet.address);
      if (state !== "absent") await linkWalletExchange(wallet, "aster");
    } catch (error) {
      asterError = error;
    }
  }
  if (!has("lighter")) {
    const state = await readLighterAccounts(wallet.address)
      .then(lighterAccountState)
      .catch(() => "absent" as const);
    if (state !== "absent") await linkWalletExchange(wallet, "lighter");
  }
  if (asterError) throw asterError;
}

/** Creates the connection of a wallet-linked exchange once, within the user's connection limit. */
async function linkWalletExchange(
  wallet: { id: string; userId: string; address: string; label: string | null },
  exchange: "aster" | "lighter",
) {
  const walletId = wallet.id;
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
      where: { walletId_exchange: { walletId, exchange } },
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
        exchange,
        externalAccountId: wallet.address.toLowerCase(),
        label:
          wallet.label ??
          `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
      },
    });
    await enqueue(connection.id, tx);
  });
}
