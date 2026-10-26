import { KEYS, sessionTokens } from './api';
import { currentLang } from './i18n';

/**
 * A script that hands the website the app's session (the same names the site
 * keeps it under) before a page of it loads, and marks it embedded so the
 * site leaves out its own phone bars.
 */
export async function sessionScript(): Promise<string> {
  const s = await sessionTokens();
  const set = (k: string, v: string | null) => (v ? `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});` : `localStorage.removeItem(${JSON.stringify(k)});`);
  return [
    'try {',
    set(KEYS.token, s.token),
    set(KEYS.refresh, s.refresh),
    set(KEYS.org, s.org),
    "sessionStorage.setItem('vertex_embedded', '1');",
    s.token ? `document.cookie = 'vertex_token=${s.token}; path=/; max-age=604800; SameSite=Lax';` : '',
    `document.cookie = 'vertex_locale=${currentLang()}; path=/; max-age=31536000; SameSite=Lax';`,
    '} catch (e) {}',
    'true;',
  ].join('\n');
}
