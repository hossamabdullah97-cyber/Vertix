'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trans, useTranslation } from 'react-i18next';
import { forgotPassword } from '@/lib/client';
import AuthShell from '@/components/AuthShell';

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await forgotPassword(email.trim());
    setSent(true);
    setBusy(false);
  }

  return (
    <AuthShell title={t('forgot.title')} subtitle={t('forgot.subtitleLong')}>
      {sent ? (
        <div>
          <p className="text-sm">
            {/* The address is bolded inside the sentence, so it has to be a Trans. */}
            <Trans i18nKey="forgot.sentTo" ns="auth" values={{ email }} components={{ 1: <b dir="ltr" /> }}>
              {'If an account exists for <1>{{email}}</1>, a reset link is on its way.'}
            </Trans>
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm text-accent">
            {t('forgot.backToLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <input
            type="email"
            className="v-field"
            placeholder={t('forgot.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="v-btn w-full" disabled={busy}>
            {busy ? t('forgot.sending') : t('forgot.submit')}
          </button>
          <Link href="/login" className="text-center text-sm text-muted">
            {t('forgot.backToLogin')}
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
