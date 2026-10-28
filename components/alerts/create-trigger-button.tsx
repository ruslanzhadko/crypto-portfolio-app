'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsDemo } from "@/components/demo/demo-context";

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
  const demo = useIsDemo();
  const params = new URLSearchParams({ tokenId, tokenSymbol, tokenName });
  if (demo) return null;
  return (
    <Button asChild size="sm">
      <Link href={`/alerts/new?${params.toString()}`} aria-label={t('createTriggerButton')}>
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">{t('createTriggerButton')}</span>
      </Link>
    </Button>
  );
}
