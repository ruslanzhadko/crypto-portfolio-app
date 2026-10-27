'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExchangeLogo } from '@/components/exchanges/exchange-logo';
import {
  LIQUIDATION_MAX,
  LIQUIDATION_MIN,
  LIQUIDATION_PERCENTS,
  type PositionAlertSettings,
} from '@/lib/positions/alert-settings';
import { POSITION_KINDS_EVENT } from './alerts-tabs';

type Kind = 'opened' | 'closed' | 'liquidation' | 'pnlSign';
const KINDS: Kind[] = ['opened', 'closed', 'liquidation', 'pnlSign'];

/** Notifications → Positions: one switch per kind, for every connected account. */
export function PositionAlertsCard({
  initial,
  connections,
}: {
  initial: PositionAlertSettings;
  connections: { id: string; label: string; exchange: string }[];
}) {
  const t = useTranslations('PositionAlerts');
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  // Typed threshold; saved on Enter or when the field loses focus.
  const [threshold, setThreshold] = useState(String(initial.liquidationPercent));
  const kindsOn = KINDS.filter((kind) => settings[kind]).length;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(POSITION_KINDS_EVENT, { detail: kindsOn }));
  }, [kindsOn]);

  function saveThreshold(raw: string) {
    // Half-percent steps within the allowed range; anything else snaps back.
    const value = Math.round(Number(raw.replace(',', '.')) * 2) / 2;
    if (!Number.isFinite(value) || value < LIQUIDATION_MIN || value > LIQUIDATION_MAX) {
      setThreshold(String(settings.liquidationPercent));
      return;
    }
    setThreshold(String(value));
    if (value !== settings.liquidationPercent) void save({ ...settings, liquidationPercent: value });
  }

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
      setThreshold(String(previous.liquidationPercent));
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {KINDS.map((kind) => (
          <li key={kind} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor={`position-alert-${kind}`} className="text-sm font-medium">
                {t(`kinds.${kind}.title`)}
              </Label>
              <p className="text-xs text-text-muted">{t(`kinds.${kind}.description`)}</p>
              {kind === 'liquidation' && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span>{t('liquidationThreshold')}</span>
                  {LIQUIDATION_PERCENTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={saving}
                      aria-pressed={settings.liquidationPercent === p}
                      onClick={() => saveThreshold(String(p))}
                      className={`h-7 rounded-md border px-2 tabular-nums transition-colors ${settings.liquidationPercent === p ? 'border-primary bg-primary/15 text-text' : 'border-border hover:border-primary/40'}`}
                    >
                      {p}
                    </button>
                  ))}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={LIQUIDATION_MIN}
                    max={LIQUIDATION_MAX}
                    step={0.5}
                    aria-label={t('liquidationCustom')}
                    title={t('liquidationCustom')}
                    disabled={saving}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    onBlur={(e) => saveThreshold(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className={`h-7 w-16 rounded-md border bg-surface-2 px-2 text-sm tabular-nums text-text ${(LIQUIDATION_PERCENTS as readonly number[]).includes(settings.liquidationPercent) ? 'border-border' : 'border-primary'}`}
                  />
                  <span>%</span>
                </div>
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
