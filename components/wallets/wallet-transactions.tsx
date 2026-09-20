'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/common/token-logo';
import { TransactionList } from './transaction-list';

export function WalletTransactions({ walletId, walletAddress, network }: {
  walletId: string; walletAddress: string; network: 'EVM' | 'SOLANA';
}) {
  const t = useTranslations('TransactionList');
  const [chain, setChain] = useState<'robinhood' | undefined>();
  return <div className="space-y-3">
    {network === 'EVM' && <div className="flex flex-wrap gap-2" role="group" aria-label={t('networkFilter')}>
      <Button variant={chain ? 'outline' : 'default'} size="sm" aria-pressed={!chain} onClick={() => setChain(undefined)}>
        {t('otherEvmNetworks')}
      </Button>
      <Button variant={chain ? 'default' : 'outline'} size="sm" aria-pressed={!!chain} onClick={() => setChain('robinhood')}>
        <TokenLogo src="/robinhood-logo.png" symbol="Robinhood" size={18} /> Robinhood
      </Button>
    </div>}
    <TransactionList key={chain ?? 'default'} walletId={walletId} walletAddress={walletAddress} chain={chain} />
  </div>;
}
