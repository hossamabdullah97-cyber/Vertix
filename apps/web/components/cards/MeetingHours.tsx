'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultWorkDays } from '@vertex/shared';
import { API_URL } from '@/lib/api';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Toggle } from '@/components/ui/Toggle';
import { CalendarConnect } from './CalendarConnect';

/** As stored in the card's theme (`theme.availability`); see apps/api/src/cards/availability.ts. */
export interface MeetingHoursValue {
  enabled: boolean;
  timezone: string;
  days: number[];
  start: string;
  end: string;
  length: number;
  notice: number;
}

const DEFAULTS: Omit<MeetingHoursValue, 'timezone'> = { enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', length: 30, notice: 2 };
const LENGTHS = [15, 20, 30, 45, 60, 90];
const NOTICE = [0, 1, 2, 4, 12, 24, 48];

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'America/New_York'];
  }
}

/**
 * When the card's owner takes meetings: the times visitors can pick in the
 * card's "Meeting" form come from here. Saves as it changes.
 */
export function MeetingHours({ cardId, slug, stored, lang }: { cardId: string; slug: string; stored: unknown; lang?: string }) {
  const { t } = useTranslation('cardEditor');
  const { locale } = useLocale();
  const saved = (stored && typeof stored === 'object' ? stored : null) as Partial<MeetingHoursValue> | null;
  // As the server reads it: until days are picked, the week is the one where
  // the owner works (Sunday to Thursday in Cairo or on an Arabic card).
  const withZone = (timezone: string): MeetingHoursValue => ({ ...DEFAULTS, days: defaultWorkDays(timezone, lang), ...saved, timezone });
  const [value, setValue] = useState<MeetingHoursValue | null>(saved?.timezone ? withZone(saved.timezone) : null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const first = useRef(true);

  // A card never set up uses the server's default zone; ask what it is, and
  // fall back to this computer's zone for a card not published yet.
  useEffect(() => {
    if (value) return;
    let cancelled = false;
    fetch(`${API_URL}/c/${slug}/availability`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((a: { timezone?: string } | null) => {
        if (cancelled) return;
        setValue(withZone(a?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save a moment after the last change. The server lays theme keys over the
  // stored theme, so this never touches the card's look.
  useEffect(() => {
    if (!value) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('saving');
    const timer = setTimeout(() => {
      authFetch(`/cards/${cardId}`, { method: 'PATCH', body: JSON.stringify({ theme: { availability: value } }) })
        .then(() => setStatus('saved'))
        .catch(() => setStatus('failed'));
    }, 600);
    return () => clearTimeout(timer);
  }, [value, cardId]);

  const weekdays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, label: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + d))) })),
    [locale],
  );
  const zoneList = useMemo(zones, []);

  if (!value) return <div className="h-40 animate-pulse rounded-xl bg-elevated" />;
  const set = (patch: Partial<MeetingHoursValue>) => setValue((v) => (v ? { ...v, ...patch } : v));
  const badHours = value.end <= value.start;
  const label = 'mb-1.5 block text-xs font-medium text-ink';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-xl px-3.5 py-3 ring-1 ring-inset ring-line">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{t('meetings.enabled')}</p>
          <p className="mt-0.5 text-xs leading-snug text-faint">{t('meetings.enabledHint')}</p>
        </div>
        <Toggle on={value.enabled} onChange={() => set({ enabled: !value.enabled })} label={t('meetings.enabled')} />
      </div>

      {value.enabled && (
        <>
          <CalendarConnect cardId={cardId} />
          <div>
            <span id="meeting-days" className={label}>
              {t('meetings.days')}
            </span>
            <div role="group" aria-labelledby="meeting-days" className="flex flex-wrap gap-1.5">
              {weekdays.map(({ d, label: name }) => {
                const on = value.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ days: on ? value.days.filter((x) => x !== d) : [...value.days, d].sort() })}
                    className={`h-11 min-w-[52px] rounded-lg px-3 text-sm font-medium transition-colors sm:h-9 ${
                      on ? 'bg-accent text-white' : 'text-muted ring-1 ring-inset ring-line hover:bg-elevated hover:text-ink'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={label}>{t('meetings.from')}</span>
              <input type="time" dir="ltr" className="v-field tabular rtl:text-right" value={value.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
            </label>
            <label className="block">
              <span className={label}>{t('meetings.to')}</span>
              <input type="time" dir="ltr" className="v-field tabular rtl:text-right" value={value.end} onChange={(e) => e.target.value && set({ end: e.target.value })} aria-invalid={badHours} />
            </label>
            <label className="block">
              <span className={label}>{t('meetings.length')}</span>
              <select className="v-field" value={value.length} onChange={(e) => set({ length: Number(e.target.value) })}>
                {LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {t('meetings.minutes', { count: m })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{t('meetings.notice')}</span>
              <select className="v-field" value={value.notice} onChange={(e) => set({ notice: Number(e.target.value) })}>
                {NOTICE.map((h) => (
                  <option key={h} value={h}>
                    {h === 0 ? t('meetings.noNotice') : t('meetings.hours', { count: h })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {badHours && <p className="text-xs text-red-600 dark:text-red-400">{t('meetings.badHours')}</p>}

          <label className="block max-w-sm">
            <span className={label}>{t('meetings.timezone')}</span>
            <select dir="ltr" className="v-field rtl:text-right" value={value.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {(zoneList.includes(value.timezone) ? zoneList : [value.timezone, ...zoneList]).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <p aria-live="polite" className="h-4 text-xs text-faint">
        {status === 'saving' ? t('meetings.saving') : status === 'saved' ? t('meetings.saved') : status === 'failed' ? t('meetings.failed') : ''}
      </p>
    </div>
  );
}
