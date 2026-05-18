import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { walletCreateSchema } from '@/lib/utils/validators';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, created, handleUnknown, ok } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const wallets = await prisma.wallet.findMany({
      where: { userId: guard.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        // _count для tokenCount теж фільтруємо — щоб збігалося з totalUsd
        _count: {
          select: {
            balances: { where: { isSpam: false, isHidden: false } },
            transactions: true,
          },
        },
        balances: {
          where: { isSpam: false, isHidden: false },
          select: { usdValue: true },
        },
      },
    });

    const data = wallets.map((w) => ({
      id: w.id,
      address: w.address,
      network: w.network,
      label: w.label,
      isActive: w.isActive,
      lastSyncAt: w.lastSyncAt,
      createdAt: w.createdAt,
      tokenCount: w._count.balances,
      transactionCount: w._count.transactions,
      totalUsd: w.balances.reduce((s, b) => s + b.usdValue, 0),
    }));

    return ok({ wallets: data });
  } catch (err) {
    return handleUnknown(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = walletCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }
    const { address, network, label } = parsed.data;

    const normalizedAddress = address.startsWith('0x')
      ? address.toLowerCase()
      : address;

    const existing = await prisma.wallet.findUnique({
      where: {
        userId_address_network: {
          userId: guard.user.id,
          address: normalizedAddress,
          network,
        },
      },
    });
    if (existing) {
      return apiError('CONFLICT', 'Цей гаманець вже додано');
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId: guard.user.id,
        address: normalizedAddress,
        network,
        label: label ?? null,
      },
    });

    return created({ wallet });
  } catch (err) {
    return handleUnknown(err);
  }
}
