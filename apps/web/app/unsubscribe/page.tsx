'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

/**
 * Where "Stop these emails" in a tip or reminder lands: turns them off for
 * that person straight away, signed in or not, and says what still comes.
 */
export default function UnsubscribePage() {
  const { t } = useTranslation('notifications');
  const [state, setState] = useState<'working' | 'done' | 'bad'>('working');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const u = q.get('u');
    const tok = q.get('t');
    if (!u || !tok) {
      setState('bad');
      return;
    }
    fetch(`${API_URL}/engagement/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ u, t: tok }) })
      .then((r) => setState(r.ok ? 'done' : 'bad'))
      .catch(() => setState('bad'));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink antialiased">
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">V</span>
          Vertex Connect
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <div role="status" className="w-full max-w-[440px] rounded-2xl bg-surface p-7 text-center shadow-sm ring-1 ring-line">
          <span
            className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${state === 'bad' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}
            aria-hidden
          >
            <Icon name={state === 'bad' ? 'alert' : state === 'done' ? 'check' : 'loader'} size={20} />
          </span>
          <h1 className="mt-4 text-lg font-semibold">{t('unsubscribe.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted" data-testid="unsubscribe-result">
            {state === 'working' ? t('unsubscribe.working') : state === 'done' ? t('unsubscribe.done') : t('unsubscribe.bad')}
          </p>
          {state === 'done' && <p className="mt-2 text-xs text-faint">{t('unsubscribe.doneHint')}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/notifications?settings=1" className="v-btn">
              {t('unsubscribe.settings')}
            </Link>
            <Link href="/dashboard" className="v-btn v-btn-ghost">
              {t('unsubscribe.home')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
