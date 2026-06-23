'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="card-gradient">
      <CardHeader>
        <CardTitle>Щось пішло не так</CardTitle>
        <CardDescription>
          {error.message || 'Несподівана помилка. Спробуйте ще раз.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => reset()}>Спробувати знову</Button>
      </CardContent>
    </Card>
  );
}
