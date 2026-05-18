import { requireUser } from '@/lib/api/auth-guard';
import { handleUnknown, ok } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/portfolio/snapshots
 * Видаляє всю накопичену історію портфеля і одразу створює новий актуальний snapshot.
 * Використовується після приховування токенів з некоректними цінами.
 */
export async function DELETE() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    await prisma.portfolioSnapshot.deleteMany({ where: { userId: guard.user.id } });
    await savePortfolioSnapshot(guard.user.id);

    return ok({ reset: true });
  } catch (err) {
    return handleUnknown(err);
  }
}
