'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { acceptInvite, apiMessageOf, type TwoStepChallenge } from '@/lib/client';
import { TwoStepForm } from './TwoStepForm';
import { AuthShell } from './AuthShell';
import { Field, FormMessage, PasswordInput, SubmitButton, authErrorText } from './fields';
import { problemOf, useChecks } from '@/lib/validate';

export function InviteForm({ token }: { token: string }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; link: boolean; signIn?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<TwoStepChallenge | null>(null);
  const checks = useChecks({ password: problemOf(password, { required: true, min: 8 }) });
  const pwError = checks.shown('password') ? t(`common:validation.${checks.shown('password')}`, { min: 8 }) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!checks.check()) return;
    setBusy(true);
    try {
      const pending = await acceptInvite(token, password, name);
      if (pending) {
        setChallenge(pending);
        setBusy(false);
        return;
      }
      window.location.href = '/dashboard';
    } catch (err) {
      // Someone who already has an account answers signed in, from the app.
      if (/already have an account/i.test(apiMessageOf(err))) {
        setError({ text: t('invite.haveAccount'), link: false, signIn: true });
        setBusy(false);
        return;
      }
      const text = authErrorText(err, t, 'link', locale);
      setError({ text, link: text === t('errors.linkInvalid') });
      setBusy(false);
    }
  }

  // The password is already set; a cancelled code screen leads to the sign-in page.
  if (challenge) {
    return <TwoStepForm mfaToken={challenge.mfaToken} onDone={() => (window.location.href = '/dashboard')} onCancel={() => (window.location.href = '/login')} />;
  }

  if (!token) {
    return <AuthShell title={t('invite.invalidTitle')} subtitle={t('invite.invalidBody')}>{null}</AuthShell>;
  }

  return (
    <AuthShell title={t('invite.title')} subtitle={t('invite.subtitle')}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && (
          <FormMessage tone="danger">
            {error.text}
            {error.link && <> {t('invite.expiredBody')}</>}
            {error.signIn && (
              <>
                {' '}
                <a href="/login?next=/invitations" className="font-medium underline">
                  {t('invite.signInToAnswer')}
                </a>
              </>
            )}
          </FormMessage>
        )}
        {!error?.link && !error?.signIn && (
          <>
            <Field
              label={
                <>
                  {t('invite.name')} <span className="font-normal text-faint">· {t('invite.optional')}</span>
                </>
              }
            >
              {(p) => <input {...p} className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('invite.namePlaceholder')} autoComplete="name" autoFocus />}
            </Field>
            <Field label={t('login.password')} hint={t('register.passwordHint')} error={pwError}>
              {(p) => <PasswordInput {...p} {...checks.bind('password')} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />}
            </Field>
            <SubmitButton busy={busy} label={t('invite.submit')} busyLabel={t('invite.joining')} />
          </>
        )}
      </form>
    </AuthShell>
  );
}
