import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { syncWallet } from '@/lib/services/wallet-sync';
import { savePortfolioSnapshot } from '@/lib/services/portfolio';
import { MoralisApiError, MoralisConfigError } from '@/lib/services/moralis';
import { AnkrApiError } from '@/lib/services/ankr';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const wallet = await prisma.wallet.findFirst({
      where: { id: params.id, userId: guard.user.id },
      select: { id: true },
    });
    if (!wallet) return apiError('NOT_FOUND', 'Гаманець не знайдено');

    const result = await syncWallet(wallet.id);
    savePortfolioSnapshot(guard.user.id).catch(() => {});

    return ok({ result });
  } catch (err) {
    if (err instanceof AnkrApiError) {
      return apiError('UPSTREAM_ERROR', `Ankr: ${err.message}`);
    }
    if (err instanceof MoralisConfigError) {
      return apiError('INTERNAL_ERROR', err.message);
    }
    if (err instanceof MoralisApiError) {
      return apiError('UPSTREAM_ERROR', `Moralis: ${err.message}`);
    }
    return handleUnknown(err);
  }
}
