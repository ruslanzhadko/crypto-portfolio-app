'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface ProfileFormProps {
  initialName: string | null;
}

export function ProfileForm({ initialName }: ProfileFormProps) {
  const router = useRouter();
  const t = useTranslations('Settings');
  const [name, setName] = useState(initialName ?? '');
  const [isPending, setPending] = useState(false);
  const { toast } = useToast();

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setPending(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast({ title: t('toastSavedTitle') });
      router.refresh();
    } catch {
      toast({
        variant: 'destructive',
        title: t('toastSaveFailedTitle'),
        description: t('toastSaveFailedDefault'),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="grid max-w-xl grid-cols-[minmax(0,1fr)_auto] items-end gap-3"
    >
      <div className="min-w-0 space-y-2">
        <Label htmlFor="name">{t('nameLabel')}</Label>
        <Input
          id="name"
          className="text-base md:text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={100}
        />
      </div>

      <Button type="submit" disabled={isPending} className="shrink-0">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('saveButton')}
      </Button>
    </form>
  );
}
