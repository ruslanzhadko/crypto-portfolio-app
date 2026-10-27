import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { exchangesEnabled } from '@/lib/exchanges/config';
import { positionAlertSettingsSchema } from '@/lib/positions/alert-settings';
import { markPositionAlertsChanged } from '@/lib/positions/signal';

/** Saves position notification settings; the worker picks them up within seconds. */
export async function PUT(req: NextRequest) {
  try {
    if (req.headers.get('origin') !== req.nextUrl.origin)
      return apiError('FORBIDDEN', 'Invalid origin');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    if (!exchangesEnabled(guard.user.id)) return apiError('FORBIDDEN', 'Exchanges are not enabled');
    const parsed = positionAlertSettingsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError('BAD_REQUEST', 'Invalid request');
    // Only the user's own connections can be excluded.
    const own = await prisma.exchangeConnection.findMany({
      where: { userId: guard.user.id, id: { in: parsed.data.excludedConnections } },
      select: { id: true },
    });
    const settings = {
      ...parsed.data,
      excludedConnections: own.map((c) => c.id),
    };
    await prisma.user.update({
      where: { id: guard.user.id },
      data: { positionAlerts: settings as Prisma.InputJsonValue },
    });
    await markPositionAlertsChanged();
    return ok({ settings });
  } catch (err) {
    return handleUnknown(err);
  }
}
