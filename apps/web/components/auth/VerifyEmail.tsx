'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { getToken, verifyEmail } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { AuthShell } from './AuthShell';
import { FormMessage, authErrorText } from './fields';

/**
 * Where the confirmation email's link lands. It confirms on arrival, with no
 * button to press, signed in or not: the link may well be opened on a phone
 * that was never signed in.
 */
export function VerifyEmail({ token }: { token: string }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const sent = useRef(false);

  useEffect(() => {
    setSignedIn(!!getToken());
    // Once only: React runs effects twice in development, and a second
    // request would find the link already used.
    if (!token || sent.current) return;
    sent.current = true;
    verifyEmail(token)
      .then((r) => {
        setEmail(r.email);
        setState('done');
      })
      .catch((err) => {
        setError(authErrorText(err, t, 'link', locale));
        setState('failed');
      });
  }, [token, t, locale]);

  const next = signedIn ? '/dashboard' : '/login';
  const nextLabel = signedIn ? t('verify.open') : t('verify.signIn');

  if (state === 'working') {
    return (
      <AuthShell title={t('verify.working')}>
        <p className="flex items-center gap-2 text-base text-muted">
          <Icon name="loader" size={16} className="animate-spin" />
          {t('verify.wait')}
        </p>
      </AuthShell>
    );
  }

  if (state === 'done') {
    return (
      <AuthShell title={t('verify.doneTitle')}>
        <div className="flex items-start gap-3 rounded-lg bg-elevated p-4 ring-1 ring-inset ring-line">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Icon name="check" size={15} />
          </span>
          <p className="text-base leading-relaxed text-ink">
            {t('verify.done', { email: `\u2068${email}\u2069` })}
          </p>
        </div>
        <Link href={next} className="v-btn mt-6 w-full !h-11 text-base sm:!h-10">
          {nextLabel}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('verify.failedTitle')} subtitle={token ? undefined : t('reset.invalidBody')}>
      {/* An expired or used link is what the line below explains; anything else (offline, too many tries) is said as is. */}
      {error && error !== t('errors.linkInvalid') && <FormMessage tone="danger">{error}</FormMessage>}
      <p className="mt-4 text-base leading-relaxed text-muted">{signedIn ? t('verify.failedSignedIn') : t('verify.failedSignedOut')}</p>
      <Link href={next} className="v-btn mt-6 w-full !h-11 text-base sm:!h-10">
        {nextLabel}
      </Link>
    </AuthShell>
  );
}
