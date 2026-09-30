'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { login, register, safeNext } from '@/lib/client';
import { AuthShell } from './AuthShell';
import { GoogleButton } from './GoogleButton';
import { Field, FormMessage, PasswordInput, SubmitButton, authErrorText, emailProps } from './fields';
import { problemOf, useChecks } from '@/lib/validate';

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

  const isLogin = mode === 'login';
  const checks = useChecks({
    name: isLogin ? null : problemOf(name, { required: true }),
    org: isLogin ? null : problemOf(org, { required: true }),
    email: problemOf(email, { required: true, kind: 'email' }),
    password: problemOf(password, { required: true, min: isLogin ? undefined : 8 }),
  });
  const say = (key: Parameters<typeof checks.shown>[0]) => {
    const p = checks.shown(key);
    return p ? t(`common:validation.${p}`, { min: 8 }) : null;
  };

  function switchTo(m: Mode) {
    setMode(m);
    setError(null);
    checks.reset();
    const q = new URLSearchParams(window.location.search);
    if (m === 'register') q.set('mode', 'register');
    else q.delete('mode');
    q.delete('expired');
    window.history.replaceState(null, '', `/login${q.toString() ? `?${q}` : ''}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!checks.check()) return;
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

  const afterGoogle = useCallback(() => {
    window.location.href = safeNext(next) ?? '/dashboard';
  }, [next]);

  return (
    <AuthShell title={isLogin ? t('login.title') : t('register.title')} subtitle={isLogin ? t('login.subtitle') : t('register.subtitle')}>
      <GoogleButton mode={mode} onDone={afterGoogle} />
      <form onSubmit={submit} noValidate className="space-y-5">
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
            <Field label={t('register.name')} error={say('name')}>
              {(p) => <input {...p} {...checks.bind('name')} className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} autoComplete="name" />}
            </Field>
            <Field label={t('register.organization')} hint={t('register.organizationHint')} error={say('org')}>
              {(p) => <input {...p} {...checks.bind('org')} className="v-field" value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t('register.organizationPlaceholder')} autoComplete="organization" />}
            </Field>
          </>
        )}

        <Field label={t('login.email')} error={say('email')}>
          {(p) => (
            <input
              {...p}
              {...checks.bind('email')}
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
          error={say('password')}
          aside={
            isLogin ? (
              <Link href="/forgot-password" className="v-hit text-xs font-medium text-accent hover:underline">
                {t('login.forgot')}
              </Link>
            ) : undefined
          }
        >
          {(p) => <PasswordInput {...p} {...checks.bind('password')} value={password} onChange={setPassword} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={isLogin ? undefined : 8} />}
        </Field>

        <SubmitButton
          busy={busy}
          label={isLogin ? t('login.submit') : t('register.submit')}
          busyLabel={isLogin ? t('login.submitting') : t('register.submitting')}
        />
      </form>

      <p className="mt-8 border-t border-line pt-6 text-center text-sm text-muted">
        {isLogin ? t('login.switchPrompt') : t('register.switchPrompt')}{' '}
        <button type="button" onClick={() => switchTo(isLogin ? 'register' : 'login')} className="v-hit font-medium text-accent hover:underline">
          {isLogin ? t('login.switchAction') : t('register.switchAction')}
        </button>
      </p>
    </AuthShell>
  );
}
