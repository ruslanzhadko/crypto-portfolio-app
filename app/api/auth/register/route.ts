import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { registerSchema } from '@/lib/utils/validators';
import { apiError, created, handleUnknown } from '@/lib/api/response';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError('CONFLICT', 'Користувач з таким email вже існує');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const role: Role =
      adminEmail && adminEmail === email ? Role.ADMIN : Role.USER;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        role,
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
    return handleUnknown(err);
  }
}
