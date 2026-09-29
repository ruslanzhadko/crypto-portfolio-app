'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function CopyWalletAddressButton({
  address,
  displayAddress,
}: {
  address: string;
  displayAddress: string;
}) {
  const t = useTranslations('WalletDetail');
  const { toast } = useToast();

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: t('walletAddressCopied') });
    } catch {
      toast({ variant: 'destructive', title: t('walletAddressCopyFailed') });
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copyAddress}
      aria-label={t('copyWalletAddress')}
      title={t('copyWalletAddress')}
      className="-ml-2 h-7 max-w-full justify-start gap-1 px-2 font-mono text-xs font-normal text-text-muted hover:text-primary sm:text-sm"
    >
      <span className="truncate">{displayAddress}</span>
      <Copy className="h-3 w-3 shrink-0" aria-hidden />
    </Button>
  );
}
