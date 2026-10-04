import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { registerSchema } from '@/lib/utils/validators';
import { apiError, created, handleUnknown } from '@/lib/api/response';
import { allowAuthAttempt, clientAddress } from '@/lib/auth/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        'BAD_REQUEST',
        'Помилка валідації',
        parsed.error.flatten(),
      );
    }

    const { email, password, name } = parsed.data;
    if (
      !(await allowAuthAttempt('register', clientAddress(req.headers), email))
    )
      return apiError('RATE_LIMIT', 'Забагато спроб. Спробуйте пізніше.');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError('CONFLICT', 'Користувач з таким email вже існує');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        role: 'USER',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return created({ user });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    )
      return apiError('CONFLICT', 'Користувач з таким email вже існує');
    return handleUnknown(err);
  }
}
