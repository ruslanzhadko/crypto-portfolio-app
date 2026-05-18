import { auth } from '@/lib/auth';
import { apiError } from '@/lib/api/response';
import type { Role } from '@prisma/client';
import type { NextResponse } from 'next/server';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  isBlocked: boolean;
}

export type GuardResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

export async function requireUser(): Promise<GuardResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: apiError('UNAUTHORIZED', 'Потрібна авторизація') };
  }
  if (session.user.isBlocked) {
    return { ok: false, response: apiError('FORBIDDEN', 'Акаунт заблоковано') };
  }
  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      role: session.user.role,
      isBlocked: session.user.isBlocked,
    },
  };
}

export async function requireAdmin(): Promise<GuardResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (result.user.role !== 'ADMIN') {
    return { ok: false, response: apiError('FORBIDDEN', 'Потрібні права адміністратора') };
  }
  return result;
}
