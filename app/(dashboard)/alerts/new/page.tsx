import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TriggerForm } from '@/components/alerts/trigger-form';

interface NewAlertPageProps {
  searchParams: {
    tokenId?: string;
    tokenSymbol?: string;
    tokenName?: string;
  };
}

export default function NewAlertPage({ searchParams }: NewAlertPageProps) {
  const initial =
    searchParams.tokenId && searchParams.tokenSymbol && searchParams.tokenName
      ? {
          tokenId: searchParams.tokenId,
          tokenSymbol: searchParams.tokenSymbol,
          tokenName: searchParams.tokenName,
        }
      : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/alerts">
          <ChevronLeft className="h-4 w-4" />
          До списку тригерів
        </Link>
      </Button>

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Новий тригер</CardTitle>
            <CardDescription>
              Налаштуйте умову, за якої CryptoPortfolio надішле вам Telegram-сповіщення.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TriggerForm initial={initial} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
