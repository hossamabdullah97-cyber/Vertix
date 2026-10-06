import { cookies } from 'next/headers';
import i18next, { type TFunction, type i18n as I18nInstance, type InitOptions } from 'i18next';
import { resources } from './resources';
import { DEFAULT_NAMESPACE, FALLBACK_LOCALE, LOCALE_COOKIE, NAMESPACES, resolveLocale, type Locale, type Namespace } from './config';

/**
 * Translations for server components: the same t() the client has (plurals,
 * interpolation), so a section can render on the server and send no script.
 * One instance per language, reused across requests; each call fixes the
 * language, so requests in different languages do not mix.
 */
const instances = new Map<Locale, I18nInstance>();

/** The language the page is in, from the cookie the client keeps. */
export async function serverLocale(): Promise<Locale> {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export function getT(locale: Locale, ns: Namespace | Namespace[]): TFunction {
  let instance = instances.get(locale);
  if (!instance) {
    // Plain i18next: react-i18next needs React's context, which server components do not have.
    instance = i18next.createInstance();
    void instance.init({
      resources,
      lng: locale,
      fallbackLng: FALLBACK_LOCALE,
      defaultNS: DEFAULT_NAMESPACE,
      ns: NAMESPACES as unknown as string[],
      interpolation: { escapeValue: false }, // React escapes
      returnNull: false,
      ...({ initImmediate: false } as object), // synchronous, so t() works at once
    } as InitOptions);
    instances.set(locale, instance);
  }
  return instance.getFixedT(locale, ns as string | string[]) as TFunction;
}
