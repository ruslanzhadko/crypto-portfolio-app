import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';

// Dev-only endpoint: upserts the E2E test user with a known password.
// Returns 404 in production so it cannot be called on live deployments.
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const email = process.env.E2E_EMAIL ?? 'e2e@test.local';
  const password = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
  // Cost 10 instead of 12 — test-only, speed matters more than hardening here
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isBlocked: false },
    create: { email, name: 'E2E User', passwordHash },
  });

  return NextResponse.json({ ok: true });
}
