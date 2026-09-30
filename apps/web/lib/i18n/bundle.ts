import { createHash } from 'node:crypto';
import { resources } from './resources';
import type { Locale } from './config';

/**
 * One language's strings as a script the browser caches: it sets
 * self.__VX_MESSAGES[locale] before the page hydrates (loaded with Next's
 * beforeInteractive in the root layout). A file of its own rather than props,
 * because props are inlined into every HTML page, escaped (each Arabic letter
 * becomes \uXXXX) and never cached.
 */
const versions = new Map<Locale, string>();

/** Changes only when the strings do, so the script can be cached for good. */
export function messagesVersion(locale: Locale): string {
  let v = versions.get(locale);
  if (!v) {
    v = createHash('sha1').update(JSON.stringify(resources[locale])).digest('hex').slice(0, 10);
    versions.set(locale, v);
  }
  return v;
}

export const messagesUrl = (locale: Locale) => `/i18n/${locale}?v=${messagesVersion(locale)}`;

export function messagesScript(locale: Locale): string {
  // "<" escaped so no string can end the script it sits in.
  const json = JSON.stringify(resources[locale]).replace(/</g, '\\u003c');
  return `(self.__VX_MESSAGES=self.__VX_MESSAGES||{})[${JSON.stringify(locale)}]=${json};`;
}
