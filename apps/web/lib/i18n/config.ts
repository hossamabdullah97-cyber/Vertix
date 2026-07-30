/**
 * Central i18n configuration — the single source of truth for supported
 * locales, direction, namespaces, and persistence keys. Adding a new language
 * later means adding it here (+ its `locales/<code>/*.json`) and nowhere else.
 */

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const FALLBACK_LOCALE: Locale = 'en';

/** Locales that render right-to-left. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

/** Human-readable names, shown in the language switcher (each in its own script). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

/** Translation namespaces, one JSON file per module in each locale folder. */
export const NAMESPACES = [
  'common',
  'nav',
  'auth',
  'dashboard',
  'cards',
  'profiles',
  'smartIdentity',
  'linkBuilder',
  'paymentLinks',
  'nfc',
  'qr',
  'crm',
  'analytics',
  'organizations',
  'teams',
  'admin',
  'integrations',
  'notifications',
  'settings',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';

/** Where the chosen locale is persisted (cookie is readable server-side too). */
export const LOCALE_COOKIE = 'vertex_locale';
export const LOCALE_STORAGE_KEY = 'vertex_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/** Normalizes any input (cookie, header, navigator) to a supported locale. */
export function resolveLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value === 'string') {
    const base = value.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
