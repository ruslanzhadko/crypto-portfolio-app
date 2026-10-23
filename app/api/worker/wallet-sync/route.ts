import { NextRequest, NextResponse } from "next/server";
import { getCache, waitUntil } from "@vercel/functions";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { workerSignalAuthorized } from "@/lib/exchanges/activity";
import { WALLET_SYNC_COOLDOWN_MS } from "@/lib/exchanges/deposit-watch";
import { syncWallet } from "@/lib/services/wallet-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  userId: z.string().min(1).max(64),
  walletId: z.string().min(1).max(64).optional(),
});
const MAX_WALLETS = 10;
const BUDGET_MS = 50_000;

/**
 * The exchange worker saw a likely deposit from a wallet: sync the user's wallets now so the money is
 * not counted on both sides until the regular wallet sync. Answers at once and syncs after the reply.
 */
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!workerSignalAuthorized(req.headers.get("authorization")))
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400, headers });
  const { userId, walletId } = parsed.data;

  // A second guard next to the worker's own cooldown: provider credits are spent per sync.
  const key = `deposit-wallet-sync:v1:${userId}`;
  const cache = getCache();
  if (await cache.get(key).catch(() => null))
    return NextResponse.json({ skipped: "COOLDOWN" }, { headers });
  await cache
    .set(key, { at: Date.now() }, { ttl: Math.ceil(WALLET_SYNC_COOLDOWN_MS / 1000), name: "deposit-wallet-sync" })
    .catch(() => {});

  const wallets = await prisma.wallet.findMany({
    where: { userId, isActive: true, user: { isBlocked: false }, ...(walletId ? { id: walletId } : {}) },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    take: MAX_WALLETS,
    select: { id: true },
  });
  const started = Date.now();
  waitUntil(
    (async () => {
      let synced = 0;
      for (const w of wallets) {
        if (Date.now() - started > BUDGET_MS) break;
        try {
          await syncWallet(w.id);
          synced++;
        } catch (err) {
          console.error(`[deposit-sync] wallet sync failed walletId=${w.id}`, err);
        }
      }
      console.info(`[deposit-sync] user wallets synced ${synced}/${wallets.length}`);
    })(),
  );
  return NextResponse.json({ wallets: wallets.length }, { status: 202, headers });
}
