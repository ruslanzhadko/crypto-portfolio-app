import { NextResponse } from 'next/server';
import { fetchLandingMarket } from '@/lib/services/landing-market';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ coins: await fetchLandingMarket() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Market data unavailable' }, { status: 503 });
  }
}
