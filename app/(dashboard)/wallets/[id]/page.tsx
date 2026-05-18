import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NetworkBadge } from '@/components/common/network-badge';
import { TokenBalanceList } from '@/components/wallets/token-balance-list';
import { TransactionList } from '@/components/wallets/transaction-list';
import { WalletSyncButton } from '@/components/wallets/wallet-sync-button';
import { formatRelative, formatUsd, shortAddress } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function WalletDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const wallet = await prisma.wallet.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      // Завантажуємо всі токени (для списку), але totalUsd — лише видимі
      balances: { orderBy: { usdValue: 'desc' } },
    },
  });

  if (!wallet) notFound();

  // Рахуємо лише не-приховані і не-спам токени
  const totalUsd = wallet.balances
    .filter((b) => !b.isSpam && !b.isHidden)
    .reduce((s, b) => s + b.usdValue, 0);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/wallets">
            <ChevronLeft className="h-4 w-4" />
            До списку гаманців
          </Link>
        </Button>
      </div>

      <Card className="card-gradient">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold md:text-3xl">
                  {wallet.label ?? 'Без назви'}
                </h1>
                <NetworkBadge network={wallet.network} />
              </div>
              <p className="break-all font-mono text-sm text-text-muted">
                {wallet.address}
              </p>
              <p className="text-xs text-text-muted">
                {wallet.lastSyncAt
                  ? `Останній sync: ${formatRelative(wallet.lastSyncAt)}`
                  : 'Ще не синхронізовано'}
              </p>
            </div>
            <div className="md:text-right">
              <p className="text-xs text-text-muted">Вартість</p>
              <p className="text-3xl font-bold">{formatUsd(totalUsd)}</p>
              <WalletSyncButton walletId={wallet.id} className="mt-3" />
            </div>
          </div>
        </CardContent>
      </Card>

      <TokenBalanceList walletId={wallet.id} tokens={wallet.balances} totalUsd={totalUsd} />

      <TransactionList walletId={wallet.id} walletAddress={wallet.address} />
    </div>
  );
}
