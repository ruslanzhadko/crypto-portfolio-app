'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExchangeLogo } from '@/components/exchanges/exchange-logo';
import {
  LIQUIDATION_PERCENTS,
  type PositionAlertSettings,
} from '@/lib/positions/alert-settings';

type Kind = 'opened' | 'closed' | 'liquidation' | 'pnlSign';
const KINDS: Kind[] = ['opened', 'closed', 'liquidation', 'pnlSign'];

/** Settings → position notifications: one switch per kind, for every connected account. */
export function PositionAlertsCard({
  initial,
  connections,
  telegramReady,
}: {
  initial: PositionAlertSettings;
  connections: { id: string; label: string; exchange: string }[];
  telegramReady: boolean;
}) {
  const t = useTranslations('PositionAlerts');
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: PositionAlertSettings) {
    const previous = settings;
    setSettings(next);
    setSaving(true);
    setError(false);
    try {
      const res = await fetch('/api/user/position-alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setSettings(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const anyOn = KINDS.some((k) => settings[k]);

  return (
    <div className="space-y-5">
      {!telegramReady && anyOn && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t('telegramOff')}
        </p>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {KINDS.map((kind) => (
          <li key={kind} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor={`position-alert-${kind}`} className="text-sm font-medium">
                {t(`kinds.${kind}.title`)}
              </Label>
              <p className="text-xs text-text-muted">{t(`kinds.${kind}.description`)}</p>
              {kind === 'liquidation' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  {t('liquidationThreshold')}
                  <select
                    className="h-8 rounded-md border border-border bg-surface-2 px-2 text-sm text-text"
                    value={settings.liquidationPercent}
                    disabled={saving}
                    onChange={(e) =>
                      void save({ ...settings, liquidationPercent: Number(e.target.value) })
                    }
                  >
                    {LIQUIDATION_PERCENTS.map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <Switch
              id={`position-alert-${kind}`}
              checked={settings[kind]}
              disabled={saving}
              onCheckedChange={(checked) => void save({ ...settings, [kind]: checked })}
            />
          </li>
        ))}
      </ul>

      {connections.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-medium">{t('accountsTitle')}</h4>
          <p className="text-xs text-text-muted">{t('accountsDescription')}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {connections.map((c) => {
              const watched = !settings.excludedConnections.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary,#6c63ff)]"
                      checked={watched}
                      disabled={saving}
                      onChange={() =>
                        void save({
                          ...settings,
                          excludedConnections: watched
                            ? [...settings.excludedConnections, c.id]
                            : settings.excludedConnections.filter((id) => id !== c.id),
                        })
                      }
                    />
                    <ExchangeLogo exchange={c.exchange} size={18} />
                    <span className="min-w-0 truncate">{c.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-text-muted" aria-live="polite">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {error ? <span className="text-danger">{t('saveFailed')}</span> : t('note')}
      </p>
    </div>
  );
}
