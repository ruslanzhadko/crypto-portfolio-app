import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, created, handleUnknown, ok } from '@/lib/api/response';
import { triggerCreateSchema } from '@/lib/utils/validators';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const triggers = await prisma.priceTrigger.findMany({
      where: { userId: guard.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ triggers });
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = triggerCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }

    // Підтягуємо поточну ціну з кешу для lastPrice
    const cached = await prisma.tokenPrice.findUnique({
      where: { tokenId: parsed.data.tokenId },
      select: { currentPrice: true },
    });

    const data = parsed.data;
    const trigger = await prisma.priceTrigger.create({
      data: {
        userId: guard.user.id,
        tokenId: data.tokenId,
        tokenSymbol: data.tokenSymbol,
        tokenName: data.tokenName,
        isActive: data.isActive,
        triggerType: data.triggerType,
        direction: data.direction,
        threshold: data.triggerType === 'PERCENT' ? data.threshold : 0,
        interval: data.triggerType === 'PERCENT' ? data.interval : 1,
        targetPrice: data.triggerType === 'PRICE_TARGET' ? data.targetPrice : null,
        lastPrice: cached?.currentPrice ?? null,
        lastCheckedAt: cached ? new Date() : null,
      },
    });

    return created({ trigger });
  } catch (err) {
    return handleUnknown(err);
  }
}
