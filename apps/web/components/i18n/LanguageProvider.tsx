'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
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

/**
 * App-wide language provider. `initialLocale` is resolved server-side from the
 * cookie (see root layout) so the first paint already matches. Switching is
 * instant: it updates i18next, <html>, and persistence without a reload, so the
 * route, form state, and session are all preserved.
 */
export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const startLocale = resolveLocale(initialLocale ?? DEFAULT_LOCALE);
  const [i18nInstance] = useState(() => createI18n(startLocale));
  const [locale, setLocaleState] = useState<Locale>(startLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      const resolved = resolveLocale(next);
      setLocaleState(resolved);
      void i18nInstance.changeLanguage(resolved);
      applyDocument(resolved);
      persist(resolved);
    },
    [i18nInstance],
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
