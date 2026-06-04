import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/auth-guard';
import { handleUnknown, ok } from '@/lib/api/response';
import { syncAllWallets } from '@/lib/services/portfolio-sync';

export const dynamic = 'force-dynamic';
// 7 EVM-мереж × N гаманців може зайняти час; даємо запас
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const force = req.nextUrl.searchParams.get('force') === 'true';
    const result = await syncAllWallets(guard.user.id, { force });
    return ok(result);
  } catch (err) {
    return handleUnknown(err);
  }
}
