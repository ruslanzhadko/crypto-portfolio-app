import { NextRequest } from 'next/server';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { runPriceUpdater } from '@/lib/cron/price-updater';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  // Vercel cron forwards Authorization: Bearer <CRON_SECRET> when set.
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const header = req.headers.get('authorization') ?? '';
  if (header === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron') === '1') return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return apiError('UNAUTHORIZED', 'Cron не авторизовано');
    }
    const result = await runPriceUpdater();
    return ok(result);
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
