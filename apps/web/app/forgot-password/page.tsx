'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trans, useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { forgotPassword } from '@/lib/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, FormMessage, SubmitButton, authErrorText, emailProps } from '@/components/auth/fields';
import { problemOf, useChecks } from '@/lib/validate';
import { Icon } from '@/components/Icon';
import { DirectionalIcon } from '@/components/i18n/DirectionalIcon';

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checks = useChecks({ email: problemOf(email, { required: true, kind: 'email' }) });
  const emailError = checks.shown('email') ? t(`common:validation.${checks.shown('email')}`) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!checks.check()) return;
    setBusy(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(authErrorText(err, t, 'link', locale));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href="/login" className="mt-8 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
      <DirectionalIcon name="arrow-left" size={14} /> {t('forgot.backToLogin')}
    </Link>
  );

  if (sent) {
    return (
      <AuthShell title={t('forgot.sentTitle')}>
        <div className="flex items-start gap-3 rounded-lg bg-elevated p-4 ring-1 ring-inset ring-line">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Icon name="mail" size={15} />
          </span>
          <p className="text-base leading-relaxed text-ink">
            {/* The address is bolded inside the sentence, so it has to be a Trans. */}
            <Trans i18nKey="forgot.sentTo" ns="auth" values={{ email: email.trim() }} components={{ 1: <bdi className="font-medium" /> }} />
          </p>
        </div>
        <button type="button" onClick={() => setSent(false)} className="v-btn v-btn-ghost mt-5 w-full !h-11 sm:!h-10">
          {t('forgot.tryAgain')}
        </button>
        {back}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('forgot.title')} subtitle={t('forgot.subtitle')}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <FormMessage tone="danger">{error}</FormMessage>}
        <Field label={t('login.email')} error={emailError}>
          {(p) => <input {...p} {...checks.bind('email')} {...emailProps('email')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} autoFocus />}
        </Field>
        <SubmitButton busy={busy} label={t('forgot.submit')} busyLabel={t('forgot.sending')} />
      </form>
      {back}
    </AuthShell>
  );
}
