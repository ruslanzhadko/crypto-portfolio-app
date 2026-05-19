import { Coins, Layers, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { formatUsd } from '@/lib/utils/format';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  const topChains = data.chains
    .slice(0, 3)
    .map((c) => c.displayName)
    .join(', ');

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Загальна вартість"
        value={formatUsd(data.totalUsd, { compact: true })}
        delta={data.priceChange24h}
        deltaLabel="за 24г"
        deltaUsd={data.priceChange24hUsd}
        icon={TrendingUp}
        iconColor="bg-primary/10 text-primary"
      />
      <StatCard
        label="Гаманці"
        value={data.walletCount}
        icon={WalletIcon}
        iconColor="bg-sky-500/10 text-sky-400"
        subtext={data.walletCount > 0 ? `${data.chains.length} активних мереж` : 'Немає гаманців'}
        href="/wallets"
      />
      <StatCard
        label="Унікальні токени"
        value={data.tokenCount}
        icon={Coins}
        iconColor="bg-amber-500/10 text-amber-400"
        subtext={data.tokenCount > 0 ? `на ${data.chains.length} ланцюгах` : undefined}
      />
      <StatCard
        label="Ланцюги"
        value={data.chains.length}
        icon={Layers}
        iconColor="bg-emerald-500/10 text-emerald-400"
        subtext={topChains || undefined}
      />
    </div>
  );
}
