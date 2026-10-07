'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthError, authFetch, isAuthenticated, logout } from '@/lib/client';
import { apiErrorText } from '@/lib/apiErrors';
import { AuthShell } from './AuthShell';
import { FormMessage } from './fields';

/** The app's own address: the code only ever goes there, never to an address from the link. */
export const APP_RETURN = 'vertexconnect://auth';

const PKCE = /^[A-Za-z0-9_~.-]{43,128}$/;

/**
 * Signing in to the phone app through the website. The app opens this page
 * with its PKCE challenge; whoever is signed in here (by password, Google or
 * their company's sign-in) is asked to confirm, and the app gets a one-time
 * code it can use only with the verifier it kept.
 */
export function AppLogin({ challenge }: { challenge: string | null }) {
  const { t } = useTranslation('auth');
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const valid = !!challenge && PKCE.test(challenge);
  const here = `/app-login?challenge=${encodeURIComponent(challenge ?? '')}`;

  useEffect(() => {
    if (!valid) return;
    if (!isAuthenticated()) {
      window.location.replace(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    authFetch<{ email: string }>('/auth/me')
      .then((me) => setWho(me.email))
      .catch(() => window.location.replace(`/login?next=${encodeURIComponent(here)}`));
  }, [valid, here]);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await authFetch<{ code: string }>('/auth/app-handoff', { method: 'POST', body: JSON.stringify({ challenge }) });
      const back = `${APP_RETURN}?code=${encodeURIComponent(code)}`;
      // Some browsers only open an app from a tap: the link stays for that.
      setLink(back);
      window.location.href = back;
    } catch (err) {
      setError(err instanceof AuthError && err.status === 0 ? t('errors.offline') : apiErrorText((err as Error).message));
      setBusy(false);
    }
  }

  function another() {
    logout();
    window.location.replace(`/login?next=${encodeURIComponent(here)}`);
  }

  if (!valid) {
    return (
      <AuthShell title={t('appLogin.invalidTitle')}>
        <FormMessage tone="danger">{t('appLogin.invalid')}</FormMessage>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('appLogin.title')} subtitle={
        who ? (
          <>
            {t('appLogin.signedInAs')} <bdi dir="ltr">{who}</bdi>
          </>
        ) : undefined
      }>
      <div className="space-y-4">
        {error && <FormMessage tone="danger">{error}</FormMessage>}
        {link && (
          <a href={link} className="v-btn w-full !h-11 text-base sm:!h-10" data-testid="app-login-open">
            {t('appLogin.openApp')}
          </a>
        )}
        <button type="button" onClick={go} disabled={busy || !who || !!link} className={`v-btn w-full !h-11 text-base sm:!h-10 ${link ? 'hidden' : ''}`} data-testid="app-login-continue">
          {busy ? t('appLogin.opening') : t('appLogin.continue')}
        </button>
        <button type="button" onClick={another} disabled={busy || !who} className="v-btn v-btn-ghost w-full !h-11 text-base sm:!h-10">
          {t('appLogin.another')}
        </button>
        <p className="text-sm leading-relaxed text-muted">{t('appLogin.note')}</p>
      </div>
    </AuthShell>
  );
}
