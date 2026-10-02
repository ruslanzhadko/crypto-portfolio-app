'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';

export function useLowValueFilter(scope: 'wallets' | 'tokens') {
  const [hidden, setHidden] = useState(false);
  const key = `portfolio:hide-low-value:${scope}`;

  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === 'true'); } catch { /* Storage may be unavailable. */ }
  }, [key]);

  function toggle(value: boolean) {
    setHidden(value);
    try { localStorage.setItem(key, String(value)); } catch { /* Keep the filter usable without storage. */ }
  }

  return [hidden, toggle] as const;
}

export function LowValueFilter({ checked, onCheckedChange }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslations('LowValueFilter');
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs text-text-muted">
      <span>{t('label')}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={t('label')} />
    </label>
  );
}
