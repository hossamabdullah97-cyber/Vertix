'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { login, register, safeNext, type TwoStepChallenge } from '@/lib/client';
import { AuthShell } from './AuthShell';
import { Icon } from '@/components/Icon';
import { GoogleButton } from './GoogleButton';
import { TwoStepForm } from './TwoStepForm';
import { Field, FormMessage, PasswordInput, SubmitButton, authErrorText, emailProps } from './fields';
import { problemOf, useChecks } from '@/lib/validate';

type Mode = 'login' | 'register';

/**
 * Sign in and sign up, one page with two sides. The side comes from the
 * address (?mode=register) so the landing page's buttons open the right one,
 * and switching sides keeps what was already typed.
 */
export function LoginForm({ initialMode, next, expired, initialKind = null }: { initialMode: Mode; next: string | null; expired: boolean; initialKind?: 'personal' | 'team' | null }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  // Who the account is for: decides whether there is a company to name.
  // A pricing page's button can say which (?kind=personal).
  const [kind, setKind] = useState<'personal' | 'team' | null>(initialKind);
  const [error, setError] = useState<{ text: string; taken?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<TwoStepChallenge | null>(null);

  const isLogin = mode === 'login';
  const checks = useChecks({
    name: isLogin ? null : problemOf(name, { required: true }),
    kind: isLogin || kind ? null : 'required',
    org: isLogin || kind !== 'team' ? null : problemOf(org, { required: true }),
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
        const pending = await login(email, password);
        if (pending) {
          setChallenge(pending);
          setBusy(false);
          return;
        }
        window.location.href = safeNext(next) ?? '/dashboard';
      } else {
        await register({ email, password, name, kind: kind!, organizationName: org });
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError({ text: authErrorText(err, t, mode, locale), taken: (err as { status?: number }).status === 409 });
      setBusy(false);
    }
  }

  const goOn = useCallback(() => {
    window.location.href = safeNext(next) ?? '/dashboard';
  }, [next]);
  const afterGoogle = useCallback((pending: TwoStepChallenge | null) => (pending ? setChallenge(pending) : goOn()), [goOn]);

  if (challenge) {
    return (
      <TwoStepForm
        mfaToken={challenge.mfaToken}
        onDone={goOn}
        onCancel={() => {
          setChallenge(null);
          setPassword('');
        }}
      />
    );
  }

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
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">{t('register.for')}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(['personal', 'team'] as const).map((k) => (
                  <label
                    key={k}
                    className={`flex cursor-pointer flex-col gap-1 rounded-xl p-3 ring-1 ring-inset transition-colors ${kind === k ? 'bg-accent/[0.06] ring-2 ring-accent' : 'ring-line hover:bg-elevated'}`}
                  >
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Icon name={k === 'personal' ? 'user' : 'users'} size={15} className={kind === k ? 'text-accent' : 'text-muted'} />
                      {t(`register.kinds.${k}`)}
                    </span>
                    <span className="text-xs leading-snug text-muted">{t(`register.kinds.${k}Body`)}</span>
                  </label>
                ))}
              </div>
              {say('kind') && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{t('register.chooseKind')}</p>}
            </fieldset>
            <Field label={t('register.name')} error={say('name')}>
              {(p) => <input {...p} {...checks.bind('name')} className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} autoComplete="name" />}
            </Field>
            {kind === 'team' && (
              <Field label={t('register.organization')} hint={t('register.organizationHint')} error={say('org')}>
                {(p) => <input {...p} {...checks.bind('org')} className="v-field" value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t('register.organizationPlaceholder')} autoComplete="organization" />}
              </Field>
            )}
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
        {!isLogin && (
          <p className="text-xs leading-relaxed text-muted">
            {t('register.agreePrefix')}{' '}
            <Link href="/legal/terms" target="_blank" className="underline underline-offset-2 hover:text-ink">
              {t('register.terms')}
            </Link>{' '}
            {/* "and the " in English, a joined "و" in Arabic: the space lives in the string. */}
            {t('register.and')}
            <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2 hover:text-ink">
              {t('register.privacy')}
            </Link>
            {t('register.agreeSuffix')}
          </p>
        )}
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
