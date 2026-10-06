import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { requireUser } from "@/lib/api/auth-guard";
import { apiError, handleUnknown, noContent, ok } from "@/lib/api/response";

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
      include: {
        // Повертаємо ВСІ балансу (UI сам вирішить що показати), але totalUsd
        // рахуємо лише з видимих — щоб число у заголовку було чесним
        balances: { orderBy: { usdValue: "desc" } },
        _count: { select: { transactions: true } },
      },
    });
    if (!wallet) return apiError("NOT_FOUND", "Гаманець не знайдено");

    const totalUsd = wallet.balances
      .filter((b) => !b.isSpam && !b.isHidden)
      .reduce((s, b) => s + b.usdValue, 0);
    return ok({ wallet: { ...wallet, totalUsd } });
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function DELETE(
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

    await prisma.$transaction(async (tx) => {
      if (exchangesEnabled(guard.user.id)) {
        const connections = await tx.exchangeConnection.findMany({
          where: { walletId: wallet.id, userId: guard.user.id },
        });
        for (const connection of connections) {
          await tx.$queryRaw`SELECT id FROM "ExchangeConnection" WHERE id = ${connection.id} FOR UPDATE`;
          await tx.exchangeConnection.update({
            where: { id: connection.id },
            data: {
              status: "DISCONNECTED",
              credentials: null,
              credentialVersion: { increment: 1 },
            },
          });
          await tx.exchangeSyncJob.deleteMany({
            where: { connectionId: connection.id },
          });
          if (connection.status !== "DISCONNECTED")
            await tx.capitalEvent.create({
              data: {
                userId: guard.user.id,
                sourceId: connection.id,
                label: connection.label,
                kind: "DISCONNECTED",
              },
            });
        }
      }
      await tx.wallet.delete({ where: { id: wallet.id } });
    });
    return noContent();
  } catch (err) {
    return handleUnknown(err);
  }
}
