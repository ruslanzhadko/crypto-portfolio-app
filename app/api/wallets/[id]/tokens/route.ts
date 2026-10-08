import {
  migratedWalletIds,
  isMigratedHypercore,
} from "@/lib/exchanges/portfolio";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/api/auth-guard";
import { apiError, handleUnknown, ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const wallet = await prisma.wallet.findFirst({
      where: { id: (await params).id, userId: guard.user.id },
      select: { id: true },
    });
    if (!wallet) return apiError("NOT_FOUND", "Гаманець не знайдено");

    const allTokens = await prisma.tokenBalance.findMany({
      where: { walletId: wallet.id },
      orderBy: { usdValue: "desc" },
    });

    const migrated = await migratedWalletIds(guard.user.id);
    const tokens = allTokens.filter(
      (b) => !isMigratedHypercore(wallet.id, b.chainName, migrated),
    );
    const totalUsd = tokens
      .filter((t) => !t.isSpam && !t.isHidden)
      .reduce((s, t) => s + t.usdValue, 0);
    return ok({ tokens, totalUsd });
  } catch (err) {
    return handleUnknown(err);
  }
}
