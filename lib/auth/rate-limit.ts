import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

/** Fixed windows with atomic counters in Postgres, shared by all instances. */
export async function allowAuthAttempt(
  action: string,
  address: string,
  email?: string,
) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Missing auth secret');
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const bucket = Math.floor(now / windowMs);
  const expiresAt = new Date((bucket + 2) * windowMs);
  const keys = [
    { value: `${action}:ip:${address}`, limit: action === 'login' ? 60 : 10 },
  ];
  if (email)
    keys.push({
      value: `${action}:email-ip:${email}:${address}`,
      limit: action === 'login' ? 10 : 5,
    });
  const attempts = await prisma.$transaction(async (tx) => {
    await tx.authRateLimit.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    const counts: number[] = [];
    for (const item of keys) {
      const key = createHmac('sha256', secret)
        .update(`${bucket}:${item.value}`)
        .digest('hex');
      const row = await tx.authRateLimit.upsert({
        where: { key },
        create: { key, attempts: 1, expiresAt },
        update: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      counts.push(row.attempts);
    }
    return counts;
  });
  return attempts.every((count, i) => count <= keys[i]!.limit);
}

export function clientAddress(headers: Headers) {
  return (
    (headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for'))
      ?.split(',')[0]
      ?.trim() || 'unknown'
  );
}
