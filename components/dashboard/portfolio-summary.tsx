import { Coins, Layers, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { formatUsd } from '@/lib/utils/format';
import type { PortfolioOverview } from '@/lib/services/portfolio';

export function PortfolioSummary({ data }: { data: PortfolioOverview }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Загальна вартість"
        value={formatUsd(data.totalUsd, { compact: true })}
        delta={data.priceChange24h}
        deltaLabel="за 24г"
        icon={TrendingUp}
      />
      <StatCard
        label="Гаманці"
        value={data.walletCount}
        icon={WalletIcon}
      />
      <StatCard
        label="Унікальні токени"
        value={data.tokenCount}
        icon={Coins}
      />
      <StatCard
        label="Ланцюги"
        value={data.chains.length}
        icon={Layers}
      />
    </div>
  );
}
