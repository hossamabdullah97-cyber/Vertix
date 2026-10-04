'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { enablePush, pushState, type PushState } from '@/lib/pwa';

const DISMISSED = 'vertex_push_prompt';

/**
 * Once, on the dashboard: an offer to hear about new leads on this device.
 * Browsers only ask for permission from a tap, and an unexplained system
 * prompt on arrival is the one people say no to, so the app asks first, in
 * its own words, and the browser only after a yes.
 */
export function PushPrompt() {
  const { t } = useTranslation('notifications');
  const { locale } = useLocale();
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED)) return;
    } catch {
      return;
    }
    pushState()
      .then((s) => {
        setState(s);
        setHidden(!(s === 'off' || s === 'ios-install'));
      })
      .catch(() => undefined);
  }, []);

  if (hidden || !state) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // the card simply comes back next time
    }
  };

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush(locale === 'ar' ? 'ar' : 'en');
      if (next === 'on' || next === 'blocked') dismiss();
      else setState(next);
    } catch {
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label={t('push.promptTitle')} className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon name="bell" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t('push.promptTitle')}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{state === 'ios-install' ? t('push.iosInstall') : t('push.promptBody')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {state === 'off' && (
          <button type="button" onClick={turnOn} disabled={busy} className="v-btn !h-11 px-4 text-sm font-semibold sm:!h-10">
            {busy ? t('loading') : t('push.promptYes')}
          </button>
        )}
        <button type="button" onClick={dismiss} className="v-btn v-btn-ghost !h-11 px-4 text-sm sm:!h-10">
          {t('push.promptNo')}
        </button>
      </div>
    </div>
  );
}
