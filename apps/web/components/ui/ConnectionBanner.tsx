'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { dismissFailed, flush, useConnection } from '@/lib/outbox';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';

/**
 * A line across the top while there is no connection, saying what waits on
 * this device (lib/outbox.ts); then "sent" for a moment once it has gone out,
 * or how many the API refused when they finally arrived.
 */
export function ConnectionBanner({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common');
  const { locale } = useLocale();
  const { online, pending, sending, failed } = useConnection();
  const [justSent, setJustSent] = useState(false);
  const hadPending = useRef(false);

  useEffect(() => {
    if (pending > 0) hadPending.current = true;
    else if (hadPending.current && online) {
      hadPending.current = false;
      setJustSent(true);
      const id = setTimeout(() => setJustSent(false), 3000);
      return () => clearTimeout(id);
    }
  }, [pending, online]);

  const n = formatNumber(pending, locale);
  let tone: 'warn' | 'ok' | 'bad' | null = null;
  let text = '';
  if (!online) {
    tone = 'warn';
    text = pending ? `${t('connection.offline')} ${t('connection.waiting', { count: pending, n })}` : `${t('connection.offline')} ${t('connection.willKeep')}`;
  } else if (pending) {
    tone = 'warn';
    text = sending ? t('connection.sending', { count: pending, n }) : t('connection.waiting', { count: pending, n });
  } else if (failed) {
    tone = 'bad';
    text = t('connection.failed', { count: failed, n: formatNumber(failed, locale) });
  } else if (justSent) {
    tone = 'ok';
    text = t('connection.sent');
  }
  if (!tone) return null;

  const colors =
    tone === 'ok'
      ? 'bg-emerald-600 text-white'
      : tone === 'bad'
        ? 'bg-red-600 text-white'
        : 'bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100';
  return (
    <div role="status" aria-live="polite" className={`min-h-10 items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium ${colors} ${className}`}>
      <Icon name={tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : 'wifi-off'} size={14} className="shrink-0" />
      <span>{text}</span>
      {online && pending > 0 && !sending && (
        <button type="button" onClick={() => void flush()} className="v-hit ms-1 underline underline-offset-2">
          {t('connection.retry')}
        </button>
      )}
      {tone === 'bad' && (
        <button type="button" onClick={dismissFailed} className="v-hit ms-1 underline underline-offset-2">
          {t('actions.close')}
        </button>
      )}
    </div>
  );
}
