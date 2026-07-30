import i18next, { type i18n as I18nInstance, type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';
import {
  DEFAULT_NAMESPACE,
  FALLBACK_LOCALE,
  NAMESPACES,
  type Locale,
} from './config';

/**
 * Creates a fresh, synchronously-initialized i18next instance for the given
 * locale.
 *
 * We deliberately do NOT use the i18next global singleton: in the App Router the
 * server module is shared across requests, so a singleton's language would bleed
 * between concurrent requests and desync SSR markup from the client (a document
 * -level hydration mismatch). A per-instance approach keeps each request/client
 * isolated. `initImmediate: false` makes init synchronous so `t()` returns real
 * values during SSR — no flash of keys, no Suspense.
 */
export function createI18n(locale: Locale): I18nInstance {
  const instance = i18next.createInstance();
  const options: InitOptions = {
    resources,
    lng: locale,
    fallbackLng: FALLBACK_LOCALE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: NAMESPACES as unknown as string[],
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
    // Synchronous init so t() returns real values during SSR (no flash/Suspense).
    // `initImmediate` is a valid runtime option missing from these @types.
    ...({ initImmediate: false } as object),
    react: { useSuspense: false },
    saveMissing: false,
    missingKeyHandler:
      process.env.NODE_ENV === 'development'
        ? (lngs, ns, key) => {
            // eslint-disable-next-line no-console
            console.warn(`[i18n] missing key "${ns}:${key}" for ${lngs.join(',')}`);
          }
        : undefined,
  };
  void instance.use(initReactI18next).init(options);
  return instance;
}
