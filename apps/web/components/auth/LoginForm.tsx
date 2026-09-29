'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { login, register, safeNext } from '@/lib/client';
import { AuthShell } from './AuthShell';
import { GoogleButton } from './GoogleButton';
import { Field, FormMessage, PasswordInput, SubmitButton, authErrorText, emailProps } from './fields';

type Mode = 'login' | 'register';

/**
 * Sign in and sign up, one page with two sides. The side comes from the
 * address (?mode=register) so the landing page's buttons open the right one,
 * and switching sides keeps what was already typed.
 */
export function LoginForm({ initialMode, next, expired }: { initialMode: Mode; next: string | null; expired: boolean }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [error, setError] = useState<{ text: string; taken?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(m: Mode) {
    setMode(m);
    setError(null);
    const q = new URLSearchParams(window.location.search);
    if (m === 'register') q.set('mode', 'register');
    else q.delete('mode');
    q.delete('expired');
    window.history.replaceState(null, '', `/login${q.toString() ? `?${q}` : ''}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        window.location.href = safeNext(next) ?? '/dashboard';
      } else {
        await register({ email, password, name, organizationName: org });
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError({ text: authErrorText(err, t, mode, locale), taken: (err as { status?: number }).status === 409 });
      setBusy(false);
    }
  }

  const isLogin = mode === 'login';
  const afterGoogle = useCallback(() => {
    window.location.href = safeNext(next) ?? '/dashboard';
  }, [next]);

  return (
    <AuthShell title={isLogin ? t('login.title') : t('register.title')} subtitle={isLogin ? t('login.subtitle') : t('register.subtitle')}>
      <GoogleButton mode={mode} onDone={afterGoogle} />
      <form onSubmit={submit} className="space-y-5">
        {isLogin && expired && !error && <FormMessage tone="info">{t('login.expired')}</FormMessage>}
        {error && (
          <FormMessage tone="danger">
            {error.text}
            {error.taken && (
              <>
                {' '}
                <button type="button" onClick={() => switchTo('login')} className="font-medium underline underline-offset-2">
                  {t('errors.signInInstead')}
                </button>
              </>
            )}
          </FormMessage>
        )}

        {!isLogin && (
          <>
            <Field label={t('register.name')}>
              {(p) => <input {...p} className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} autoComplete="name" required />}
            </Field>
            <Field label={t('register.organization')} hint={t('register.organizationHint')}>
              {(p) => <input {...p} className="v-field" value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t('register.organizationPlaceholder')} autoComplete="organization" required />}
            </Field>
          </>
        )}

        <Field label={t('login.email')}>
          {(p) => (
            <input
              {...p}
              {...emailProps(isLogin ? 'username' : 'email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              autoFocus={isLogin}
            />
          )}
        </Field>

        <Field
          label={t('login.password')}
          hint={isLogin ? undefined : t('register.passwordHint')}
          aside={
            isLogin ? (
              <Link href="/forgot-password" className="v-hit text-[12.5px] font-medium text-accent hover:underline">
                {t('login.forgot')}
              </Link>
            ) : undefined
          }
        >
          {(p) => <PasswordInput {...p} value={password} onChange={setPassword} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={isLogin ? undefined : 8} />}
        </Field>

        <SubmitButton
          busy={busy}
          label={isLogin ? t('login.submit') : t('register.submit')}
          busyLabel={isLogin ? t('login.submitting') : t('register.submitting')}
        />
      </form>

      <p className="mt-8 border-t border-line pt-6 text-center text-[13.5px] text-muted">
        {isLogin ? t('login.switchPrompt') : t('register.switchPrompt')}{' '}
        <button type="button" onClick={() => switchTo(isLogin ? 'register' : 'login')} className="v-hit font-medium text-accent hover:underline">
          {isLogin ? t('login.switchAction') : t('register.switchAction')}
        </button>
      </p>
    </AuthShell>
  );
}
