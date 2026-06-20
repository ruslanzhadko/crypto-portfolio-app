import { getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TriggerForm } from '@/components/alerts/trigger-form';

interface NewAlertPageProps {
  searchParams: Promise<{
    tokenId?: string;
    tokenSymbol?: string;
    tokenName?: string;
  }>;
}

export default async function NewAlertPage({ searchParams }: NewAlertPageProps) {
  const t = await getTranslations('NewAlert');
  const params = await searchParams;
  const initial =
    params.tokenId && params.tokenSymbol && params.tokenName
      ? {
          tokenId: params.tokenId,
          tokenSymbol: params.tokenSymbol,
          tokenName: params.tokenName,
        }
      : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/alerts">
          <ChevronLeft className="h-4 w-4" />
          {t('backToTriggers')}
        </Link>
      </Button>

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
            <CardDescription>{t('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <TriggerForm initial={initial} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
