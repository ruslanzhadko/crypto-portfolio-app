import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/api/auth-guard";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { exchangeJson, failure, safeApiFailure } from "@/lib/exchanges/api";
import { transferChain, transferExplorerUrl } from "@/lib/exchanges/transfer-networks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Latest deposits and withdrawals of the user's exchange accounts for the dashboard list.
 * Reads the stored history only (the worker keeps it current); unlike other exchange routes it
 * does not mark the user active, so opening the dashboard keeps the worker in its idle cadence.
 */
export async function GET(req: Request) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    if (!exchangesEnabled(guard.user.id)) return failure("NOT_FOUND", 404);
    const requested = Number.parseInt(new URL(req.url).searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 5), 100) : 20;

    const accounts = await prisma.exchangeConnection.findMany({
      where: { userId: guard.user.id, status: { not: "DISCONNECTED" } },
      select: { id: true, exchange: true, label: true, transfersError: true },
      orderBy: { createdAt: "desc" },
    });
    const rows = accounts.length
      ? await prisma.exchangeTransfer.findMany({
          where: { connectionId: { in: accounts.map((a) => a.id) } },
          orderBy: { occurredAt: "desc" },
          take: limit + 1,
          select: {
            id: true,
            connectionId: true,
            direction: true,
            asset: true,
            network: true,
            amount: true,
            fee: true,
            address: true,
            txHash: true,
            status: true,
            occurredAt: true,
          },
        })
      : [];
    const byId = new Map(accounts.map((a) => [a.id, a]));
    // Every deposit address an account has used: a wallet send there is a move to that exchange,
    // even when the deposit itself is older than the loaded page.
    const depositAddresses = accounts.length
      ? await prisma.exchangeTransfer.findMany({
          where: { connectionId: { in: accounts.map((a) => a.id) }, direction: "deposit", address: { not: null } },
          distinct: ["connectionId", "address"],
          select: { connectionId: true, address: true },
        })
      : [];

    return exchangeJson({
      transfers: rows.slice(0, limit).map((row) => {
        const account = byId.get(row.connectionId)!;
        const chain = transferChain(row.network);
        return {
          id: row.id,
          connectionId: row.connectionId,
          exchange: account.exchange,
          accountLabel: account.label,
          direction: row.direction,
          asset: row.asset,
          chain,
          amount: row.amount.toFixed(),
          fee: row.fee?.toFixed() ?? null,
          status: row.status,
          timestamp: row.occurredAt.toISOString(),
          explorerUrl: transferExplorerUrl(chain, row.txHash),
          // Hash and address let the list pair this transfer with the user's own wallets.
          txHash: row.txHash,
          address: row.address,
        };
      }),
      hasMore: rows.length > limit,
      accounts: accounts.map(({ id, exchange, label }) => ({ id, exchange, label })),
      depositAddresses,
      // Accounts whose history cannot be read (e.g. a key without the wallet permission).
      unavailable: accounts.filter((a) => a.transfersError).map((a) => a.label),
    });
  } catch (error) {
    return safeApiFailure(error);
  }
}
