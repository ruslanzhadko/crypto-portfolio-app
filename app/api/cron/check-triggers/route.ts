import { NextRequest } from 'next/server';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { runTriggerCheck } from '@/lib/cron/price-updater';
import { isCronAuthorized } from '@/lib/cron/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req.headers.get('authorization'))) {
      return apiError('UNAUTHORIZED', 'Cron не авторизовано');
    }
    const result = await runTriggerCheck();
    return ok(result);
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
