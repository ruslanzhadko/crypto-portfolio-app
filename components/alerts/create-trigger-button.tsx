'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreateTriggerButtonProps {
  tokenId: string;
  tokenSymbol: string;
  tokenName: string;
}

export function CreateTriggerButton({
  tokenId,
  tokenSymbol,
  tokenName,
}: CreateTriggerButtonProps) {
  const t = useTranslations('Alerts');
  const params = new URLSearchParams({ tokenId, tokenSymbol, tokenName });
  return (
    <Button asChild>
      <Link href={`/alerts/new?${params.toString()}`}>
        <Bell className="h-4 w-4" />
        {t('createTriggerButton')}
      </Link>
    </Button>
  );
}
