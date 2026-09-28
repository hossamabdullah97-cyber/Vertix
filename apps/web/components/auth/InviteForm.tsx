'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { acceptInvite } from '@/lib/client';
import { AuthShell } from './AuthShell';
import { Field, FormMessage, PasswordInput, SubmitButton, authErrorText } from './fields';

export function InviteForm({ token }: { token: string }) {
  const { t } = useTranslation('auth');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; link: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await acceptInvite(token, password, name);
      window.location.href = '/dashboard';
    } catch (err) {
      const text = authErrorText(err, t, 'link');
      setError({ text, link: text === t('errors.linkInvalid') });
      setBusy(false);
    }
  }

  if (!token) {
    return <AuthShell title={t('invite.invalidTitle')} subtitle={t('invite.invalidBody')}>{null}</AuthShell>;
  }

  return (
    <AuthShell title={t('invite.title')} subtitle={t('invite.subtitle')}>
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <FormMessage tone="danger">
            {error.text}
            {error.link && <> {t('invite.expiredBody')}</>}
          </FormMessage>
        )}
        {!error?.link && (
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
            <Field label={t('login.password')} hint={t('register.passwordHint')}>
              {(p) => <PasswordInput {...p} value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />}
            </Field>
            <SubmitButton busy={busy} label={t('invite.submit')} busyLabel={t('invite.joining')} />
          </>
        )}
      </form>
    </AuthShell>
  );
}
