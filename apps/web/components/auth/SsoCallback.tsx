'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { AuthError, SsoNotStartedHere, safeNext, ssoFinish } from '@/lib/client';
import { apiErrorText } from '@/lib/apiErrors';
import { Icon } from '@/components/Icon';
import { AuthShell } from './AuthShell';
import { FormMessage } from './fields';

type Outcome = { kind: 'working' } | { kind: 'tested'; email: string } | { kind: 'failed'; text: string };

/** Back from the company's provider: finishes the sign-in, or shows how a test went. */
export function SsoCallback({ code, state, providerError }: { code: string | null; state: string | null; providerError: string | null }) {
  const { t } = useTranslation('auth');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'working' });
  const ran = useRef(false);

  useEffect(() => {
    // The code works once; a second run (a remount) would spend it for nothing.
    if (ran.current) return;
    ran.current = true;
    if (providerError || !code || !state) {
      setOutcome({ kind: 'failed', text: providerError ? t('sso.providerSaid', { reason: providerError }) : t('sso.notHere') });
      return;
    }
    ssoFinish(code, state)
      .then(({ tested, next }) => {
        if (tested) setOutcome({ kind: 'tested', email: tested });
        else window.location.replace(safeNext(next) ?? '/dashboard');
      })
      .catch((err) => {
        const text =
          err instanceof SsoNotStartedHere ? t('sso.notHere') : err instanceof AuthError && err.status === 0 ? t('errors.offline') : apiErrorText((err as Error).message);
        setOutcome({ kind: 'failed', text });
      });
  }, [code, state, providerError, t]);

  if (outcome.kind === 'tested') {
    return (
      <AuthShell title={t('sso.testedTitle')}>
        <div className="flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" data-testid="sso-tested">
          <Icon name="check" size={16} className="mt-0.5 shrink-0" />
          <p>{t('sso.testedBody', { email: `⁨${outcome.email}⁩` })}</p>
        </div>
        <Link href="/workspace?section=sso" className="v-btn mt-6 w-full !h-11 text-base sm:!h-10">
          {t('sso.backToSettings')}
        </Link>
      </AuthShell>
    );
  }
  if (outcome.kind === 'failed') {
    return (
      <AuthShell title={t('sso.failedTitle')}>
        <FormMessage tone="danger">{outcome.text}</FormMessage>
        <Link href="/sso" className="v-hit mt-6 inline-block text-sm font-medium text-accent hover:underline">
          {t('sso.tryAgain')}
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t('sso.finishing')}>
      <div className="flex justify-center py-6" role="status" aria-label={t('sso.finishing')}>
        <Icon name="loader" size={22} className="animate-spin text-muted" />
      </div>
    </AuthShell>
  );
}
