import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/api/auth-guard';
import { handleUnknown, ok } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      blockedUsers,
      totalWallets,
      activeTriggers,
      notifications24h,
      notificationsSent,
      notificationsFailed,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: true } }),
      prisma.wallet.count(),
      prisma.priceTrigger.count({ where: { isActive: true } }),
      prisma.notificationLog.count({ where: { sentAt: { gte: since24h } } }),
      prisma.notificationLog.count({ where: { status: 'sent' } }),
      prisma.notificationLog.count({ where: { status: 'failed' } }),
    ]);

    return ok({
      stats: {
        totalUsers,
        blockedUsers,
        totalWallets,
        activeTriggers,
        notifications24h,
        notificationsSent,
        notificationsFailed,
      },
    });
  } catch (err) {
    return handleUnknown(err);
  }
}
