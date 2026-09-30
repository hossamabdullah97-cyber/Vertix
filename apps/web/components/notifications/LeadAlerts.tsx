'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';

interface Settings {
  email: boolean;
  whatsapp: boolean;
  phone: string | null;
  lang: 'en' | 'ar';
  address: string | null;
  whatsappReady: boolean;
}

/** Same rule as the API: digits with the country code; Egyptian 01… is understood. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^01[0125]\d{8}$/.test(d)) d = `20${d.slice(1)}`;
  if (d.includes('+')) return null;
  return /^[1-9]\d{7,14}$/.test(d) ? d : null;
}

function Switch({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative mt-1 inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors before:absolute before:-inset-3 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 sm:before:hidden ${on ? 'bg-accent' : ''}`}
      style={on ? undefined : { background: 'hsl(var(--v-border-strong))' }}
    >
      <span className={`pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[inset-inline-start] ${on ? 'start-[14px]' : 'start-[2px]'}`} />
    </button>
  );
}

/**
 * New leads by email and on WhatsApp, so an owner hears about a visitor
 * while it still matters, without keeping the app open.
 */
export function LeadAlerts({ open }: { open: boolean }) {
  const { t } = useTranslation('notifications');
  const { locale } = useLocale();
  const lang = locale === 'ar' ? 'ar' : 'en';
  const [s, setS] = useState<Settings | null>(null);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | 'test-email' | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    authFetch<Settings>('/notifications/lead-alerts')
      .then((r) => {
        setS(r);
        setPhone(r.phone ? `+${r.phone}` : '');
      })
      .catch(() => setS(null));
  }, [open]);

  async function save(patch: Partial<Pick<Settings, 'email' | 'whatsapp' | 'phone'>>, done?: string) {
    const before = s;
    if (s) setS({ ...s, ...patch });
    try {
      // The alerts are written in the language this person uses the app in.
      const next = await authFetch<Settings>('/notifications/lead-alerts', { method: 'PATCH', body: JSON.stringify({ ...patch, lang }) });
      setS(next);
      setPhone(next.phone ? `+${next.phone}` : '');
      if (done) setStatus({ kind: 'ok', text: done });
      return true;
    } catch {
      setS(before);
      setStatus({ kind: 'error', text: t('alerts.saveFailed') });
      return false;
    }
  }

  async function savePhone() {
    const typed = phone.trim();
    if (!typed) {
      setBusy('save');
      await save({ phone: null }, t('alerts.removed'));
      setBusy(null);
      return;
    }
    const n = normalizePhone(typed);
    if (!n) {
      setStatus({ kind: 'error', text: t('alerts.badPhone') });
      return;
    }
    setBusy('save');
    await save({ phone: n, whatsapp: true }, t('alerts.saved'));
    setBusy(null);
  }

  async function test(channel: 'whatsapp' | 'email' = 'whatsapp') {
    setBusy(channel === 'email' ? 'test-email' : 'test');
    setStatus(null);
    try {
      await authFetch('/notifications/lead-alerts/test', { method: 'POST', body: JSON.stringify({ channel, lang }) });
      setStatus({ kind: 'ok', text: channel === 'email' ? t('alerts.testEmailSent', { address: s?.address ?? '' }) : t('alerts.testSent') });
    } catch (e) {
      setStatus({ kind: 'error', text: /too many/i.test((e as Error).message) ? t('alerts.tooMany') : t('alerts.testFailed') });
    } finally {
      setBusy(null);
    }
  }

  const saved = s?.phone ? `+${s.phone}` : '';
  const dirty = phone.trim() !== saved;

  return (
    <section className="mt-6" aria-labelledby="lead-alerts-title">
      <h3 id="lead-alerts-title" className="text-[13.5px] font-semibold text-ink">
        {t('alerts.title')}
      </h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t('alerts.intro')}</p>

      <ul className="-mx-5 mt-3 divide-y divide-line border-y border-line">
        <li className="flex items-start gap-3 px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
            <Icon name="mail" size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-ink">{t('alerts.email')}</span>
            <span className="mt-0.5 block truncate text-[12.5px] text-muted">
              <bdi dir="ltr">{s?.address ?? '…'}</bdi>
            </span>
            {/* See exactly what arrives before a real visitor does. */}
            {s?.email && s.address && (
              <button type="button" className="v-hit mt-1.5 text-[12.5px] font-medium text-accent hover:underline disabled:opacity-60" disabled={busy !== null} onClick={() => test('email')}>
                {busy === 'test-email' ? t('loading') : t('alerts.testEmail')}
              </button>
            )}
          </span>
          <Switch on={!!s?.email} disabled={!s} label={t('alerts.email')} onClick={() => s && save({ email: !s.email })} />
        </li>

        <li className="px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
              <Icon name="whatsapp" size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-ink">{t('alerts.whatsapp')}</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                {s && !s.whatsappReady ? t('alerts.notReady') : t('alerts.whatsappHint')}
              </span>
            </span>
            <Switch
              on={!!s?.whatsapp}
              disabled={!s || !s.whatsappReady || (!s.phone && !s.whatsapp)}
              label={t('alerts.whatsapp')}
              onClick={() => s && save({ whatsapp: !s.whatsapp })}
            />
          </div>

          {s?.whatsappReady && (
            <div className="mt-3 ps-11">
              <label className="block text-[12.5px] font-medium text-ink" htmlFor="wa-number">
                {t('alerts.number')}
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="wa-number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  className="v-field min-w-0 flex-1"
                  placeholder="+20 100 123 4567"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setStatus(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dirty) void savePhone();
                  }}
                />
                {dirty ? (
                  <button type="button" className="v-btn v-btn-primary shrink-0" disabled={busy !== null} onClick={savePhone}>
                    {busy === 'save' ? t('loading') : t('alerts.save')}
                  </button>
                ) : (
                  s.phone && (
                    <button type="button" className="v-btn v-btn-ghost shrink-0" disabled={busy !== null} onClick={() => test()}>
                      {busy === 'test' ? t('loading') : t('alerts.test')}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </li>
      </ul>

      <p role="status" aria-live="polite" className={`mt-2 min-h-[18px] text-[12.5px] ${status?.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
        {status?.text}
      </p>
    </section>
  );
}
