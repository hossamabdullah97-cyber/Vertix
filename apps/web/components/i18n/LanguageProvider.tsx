'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useRouter } from 'next/navigation';
import type { ResourceLanguage } from 'i18next';
import { createI18n } from '@/lib/i18n';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_STORAGE_KEY,
  dirOf,
  resolveLocale,
  type Locale,
} from '@/lib/i18n/config';

interface LocaleContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function persist(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* storage unavailable — locale still applies for this session */
  }
}

/** Reflects the active locale onto <html lang/dir> — the single place that does. */
function applyDocument(locale: Locale) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.lang = locale;
  el.dir = dirOf(locale);
}

declare global {
  // Set by /i18n/<locale> in the browser, and by the root layout on the server.
  // eslint-disable-next-line no-var
  var __VX_MESSAGES: Partial<Record<Locale, ResourceLanguage>> | undefined;
}

/** Runs a language's script once; resolves when its strings are in place. */
function loadMessages(locale: Locale, url: string): Promise<ResourceLanguage> {
  const ready = globalThis.__VX_MESSAGES?.[locale];
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => (globalThis.__VX_MESSAGES?.[locale] ? resolve(globalThis.__VX_MESSAGES[locale]!) : reject(new Error('no messages')));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * App-wide language provider. `initialLocale` is resolved server-side from the
 * cookie (see root layout) so the first paint already matches. Its strings are
 * already loaded: a cached script per language, run before hydration (see
 * lib/i18n/bundle.ts), so the page carries only the language it is shown in.
 * Switching fetches the other one once (`urls`), then updates i18next, <html>,
 * and persistence without a reload, so the route, form state, and session are
 * all preserved.
 */
export function LanguageProvider({
  initialLocale,
  urls,
  children,
}: {
  initialLocale?: Locale;
  urls: Record<Locale, string>;
  children: React.ReactNode;
}) {
  const startLocale = resolveLocale(initialLocale ?? DEFAULT_LOCALE);
  const [i18nInstance] = useState(() => createI18n(startLocale, globalThis.__VX_MESSAGES?.[startLocale] ?? {}));
  const [locale, setLocaleState] = useState<Locale>(startLocale);
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      const resolved = resolveLocale(next);
      const apply = () => {
        setLocaleState(resolved);
        void i18nInstance.changeLanguage(resolved);
        applyDocument(resolved);
        // Parts rendered on the server (the home page's sections) read the
        // language from the cookie set above: render them again in it.
        router.refresh();
      };
      persist(resolved);
      if (i18nInstance.hasResourceBundle(resolved, 'common')) return apply();
      void loadMessages(resolved, urls[resolved])
        .then((bundle) => {
          for (const [ns, strings] of Object.entries(bundle)) i18nInstance.addResourceBundle(resolved, ns, strings, true, true);
          apply();
        })
        .catch(() => {
          // Offline or the chunk failed: a reload picks the language from the saved cookie.
          window.location.reload();
        });
    },
    [i18nInstance, urls, router],
  );

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }, [locale, setLocale]);

  // On mount, reconcile with any stored preference the server cookie missed
  // (e.g. a locale saved on another tab), and ensure <html> is in sync.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const resolved = resolveLocale(stored ?? startLocale);
    if (resolved !== locale) setLocale(resolved);
    else applyDocument(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: dirOf(locale), setLocale, toggleLocale }),
    [locale, setLocale, toggleLocale],
  );

  return (
    <I18nextProvider i18n={i18nInstance}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}

/** Access + change the active locale and direction anywhere in the tree. */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within <LanguageProvider>');
  return ctx;
}
