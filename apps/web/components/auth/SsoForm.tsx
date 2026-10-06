'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { AuthError, ssoStart } from '@/lib/client';
import { apiErrorText } from '@/lib/apiErrors';
import { problemOf, useChecks } from '@/lib/validate';
import { AuthShell } from './AuthShell';
import { Field, FormMessage, SubmitButton, emailProps } from './fields';

/** Signing in through one's company: the work address decides where to go. */
export function SsoForm({ next, initialEmail = '' }: { next: string | null; initialEmail?: string }) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checks = useChecks({ email: problemOf(email, { required: true, kind: 'email' }) });
  const problem = checks.shown('email');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!checks.check()) return;
    setBusy(true);
    try {
      await ssoStart(email, next);
    } catch (err) {
      setError(err instanceof AuthError && err.status === 0 ? t('errors.offline') : apiErrorText((err as Error).message));
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('sso.title')} subtitle={t('sso.subtitle')}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <FormMessage tone="danger">{error}</FormMessage>}
        <Field label={t('sso.email')} error={problem ? t(`common:validation.${problem}`) : null}>
          {(p) => (
            <input
              {...p}
              {...checks.bind('email')}
              {...emailProps('username')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              autoFocus
            />
          )}
        </Field>
        <SubmitButton busy={busy} label={t('sso.submit')} busyLabel={t('sso.submitting')} />
      </form>
      <p className="mt-8 border-t border-line pt-6 text-center text-sm">
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="v-hit font-medium text-accent hover:underline">
          {t('sso.back')}
        </Link>
      </p>
    </AuthShell>
  );
}
