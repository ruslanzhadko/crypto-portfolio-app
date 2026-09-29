import { NextRequest, NextResponse } from 'next/server';
import { ok } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  if (req.nextUrl.searchParams.get('db') !== '1') {
    return ok({ status: 'ok', db: 'unchecked', timestamp });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: 'ok', db: 'up', timestamp });
  } catch {
    return NextResponse.json(
      { status: 'degraded', db: 'down', timestamp },
      { status: 503 },
    );
  }
}
