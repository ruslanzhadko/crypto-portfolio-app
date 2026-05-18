'use client';

import Link from 'next/link';
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
  const params = new URLSearchParams({
    tokenId,
    tokenSymbol,
    tokenName,
  });
  return (
    <Button asChild>
      <Link href={`/alerts/new?${params.toString()}`}>
        <Bell className="h-4 w-4" />
        Створити тригер
      </Link>
    </Button>
  );
}
