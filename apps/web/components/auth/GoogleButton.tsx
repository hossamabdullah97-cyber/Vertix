'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { authProviders, googleSignIn } from '@/lib/client';
import { FormMessage, authErrorText } from './fields';

interface GoogleId {
  initialize(opts: Record<string, unknown>): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in could not load'));
    };
    document.head.appendChild(el);
  });
  return loading;
}

/**
 * Google's own "Continue with Google" button, shown only when the server has
 * a Google client id. Someone new gets an account and a workspace; someone
 * who already signs in with that email is signed in to their account.
 */
export function GoogleButton({ mode, onDone }: { mode: 'login' | 'register'; onDone: () => void }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    authProviders().then((p) => live && setClientId(p.google));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let live = true;
    loadScript()
      .then(() => {
        const id = window.google?.accounts.id;
        if (!live || !id || !box.current) return;
        id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          context: mode === 'register' ? 'signup' : 'signin',
          callback: async ({ credential }: { credential: string }) => {
            setError(null);
            setBusy(true);
            try {
              await googleSignIn(credential);
              onDone();
            } catch (err) {
              setError(authErrorText(err, t, 'google', locale));
              setBusy(false);
            }
          },
        });
        box.current.replaceChildren();
        id.renderButton(box.current, {
          type: 'standard',
          theme: box.current.closest('[data-theme="dark"]') ? 'filled_black' : 'outline',
          size: 'large',
          text: mode === 'register' ? 'signup_with' : 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, box.current.offsetWidth || 360),
          locale,
        });
      })
      // Blocked or offline: leave email and password as the way in.
      .catch(() => live && setClientId(null));
    return () => {
      live = false;
    };
  }, [clientId, mode, locale, onDone, t]);

  if (!clientId) return null;

  return (
    <div className="mb-6">
      {error && (
        <div className="mb-3">
          <FormMessage tone="danger">{error}</FormMessage>
        </div>
      )}
      <div ref={box} aria-busy={busy} className={`flex min-h-[44px] justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`} />
      <div className="mt-6 flex items-center gap-3 text-[12px] text-faint" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        {t('google.or')}
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
