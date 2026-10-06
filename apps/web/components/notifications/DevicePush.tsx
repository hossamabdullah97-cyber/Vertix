'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { canPromptInstall, disablePush, enablePush, isStandalone, onInstallChange, promptInstall, pushState, sendTestPush, type PushState } from '@/lib/pwa';
import { Switch } from './LeadAlerts';

/**
 * Notifications on this phone or computer's lock screen, and installing the
 * app. Per device, because that is how browsers grant it: turning it on here
 * says nothing about the person's other devices.
 */
export function DevicePush({ open }: { open: boolean }) {
  const { t } = useTranslation('notifications');
  const { locale } = useLocale();
  const lang = locale === 'ar' ? 'ar' : 'en';
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<'toggle' | 'test' | 'install' | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    pushState().then(setState).catch(() => setState('unavailable'));
    setInstallable(canPromptInstall());
    return onInstallChange(() => setInstallable(canPromptInstall()));
  }, [open]);

  if (state === null || (state === 'unavailable' && !installable)) return null;

  async function toggle() {
    setBusy('toggle');
    setStatus(null);
    try {
      const next = state === 'on' ? await disablePush() : await enablePush(lang);
      setState(next);
      if (next === 'blocked') setStatus({ kind: 'error', text: t('push.blocked') });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message || t('push.failed') });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setStatus(null);
    try {
      const r = await sendTestPush();
      setStatus(r.sent ? { kind: 'ok', text: t('push.testSent') } : { kind: 'error', text: t('push.failed') });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message || t('push.failed') });
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    setBusy('install');
    try {
      await promptInstall();
    } finally {
      setBusy(null);
    }
  }

  const hint =
    state === 'ios-install'
      ? t('push.iosInstall')
      : state === 'blocked'
        ? t('push.blocked')
        : state === 'unavailable'
          ? t('push.unsupported')
          : t('push.hint');

  return (
    <section className="mt-6" aria-labelledby="device-push-title">
      <h3 id="device-push-title" className="text-sm font-semibold text-ink">
        {t('push.title')}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t('push.intro')}</p>

      <ul className="-mx-5 mt-3 divide-y divide-line border-y border-line">
        <li className="flex items-start gap-3 px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
            <Icon name="bell" size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{t('push.label')}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
            {state === 'on' && (
              <button type="button" className="v-hit mt-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-60" disabled={busy !== null} onClick={test}>
                {busy === 'test' ? t('loading') : t('push.test')}
              </button>
            )}
          </span>
          <Switch
            on={state === 'on'}
            disabled={busy !== null || state === 'ios-install' || state === 'blocked' || state === 'unavailable'}
            label={t('push.label')}
            onClick={toggle}
          />
        </li>

        {installable && !isStandalone() && (
          <li className="flex items-start gap-3 px-5 py-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
              <Icon name="download" size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{t('push.install')}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t('push.installHint')}</span>
            </span>
            <button type="button" className="v-btn v-btn-ghost shrink-0" disabled={busy !== null} onClick={install}>
              {t('push.installButton')}
            </button>
          </li>
        )}
      </ul>

      {status && (
        <p role="status" className={`mt-3 text-xs ${status.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}
