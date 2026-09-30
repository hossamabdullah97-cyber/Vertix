'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { resetPassword } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { AuthShell } from './AuthShell';
import { Field, FormMessage, PasswordInput, SubmitButton, authErrorText } from './fields';

export function ResetForm({ token }: { token: string }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ text: string; link: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const text = authErrorText(err, t, 'link', locale);
      setError({ text, link: text === t('errors.linkInvalid') });
    } finally {
      setBusy(false);
    }
  }

  const requestNew = (
    <Link href="/forgot-password" className="v-btn mt-6 w-full !h-11 text-base sm:!h-10">
      {t('reset.requestNew')}
    </Link>
  );

  if (!token) {
    return (
      <AuthShell title={t('reset.invalidTitle')} subtitle={t('reset.invalidBody')}>
        {requestNew}
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={t('reset.doneTitle')}>
        <div className="flex items-start gap-3 rounded-lg bg-elevated p-4 ring-1 ring-inset ring-line">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Icon name="check" size={15} />
          </span>
          <p className="text-base leading-relaxed text-ink">{t('reset.done')}</p>
        </div>
        <Link href="/login" className="v-btn mt-6 w-full !h-11 text-base sm:!h-10">
          {t('reset.signIn')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('reset.title')} subtitle={t('reset.subtitle')}>
      <form onSubmit={submit} className="space-y-5">
        {error && <FormMessage tone="danger">{error.text}</FormMessage>}
        {error?.link ? (
          requestNew
        ) : (
          <>
            <Field label={t('reset.newPassword')} hint={t('register.passwordHint')}>
              {(p) => <PasswordInput {...p} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />}
            </Field>
            <SubmitButton busy={busy} label={t('reset.submit')} busyLabel={t('reset.saving')} />
          </>
        )}
      </form>
    </AuthShell>
  );
}
