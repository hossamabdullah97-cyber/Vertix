import { WEB_BASE } from './config';

/**
 * Where in the app a website address leads: the links the app opens itself
 * (Universal Links / App Links, see app.config.ts) and the address a push
 * notification carries. A page the app has no screen for opens inside the
 * app's website view; another site's address is not the app's to open (null).
 * A workspace in the link (?org=) is kept, so the screen opens there.
 */
export function appRoute(input: string, web: string = WEB_BASE): string | null {
  let url: URL;
  try {
    url = new URL(input, web);
  } catch {
    return null;
  }
  // The website handing back a sign-in (lib/web-sign-in.ts reads it): no screen of its own.
  if (url.protocol === 'vertexconnect:' && url.host === 'auth') return null;
  // The app's own scheme already names a screen.
  if (url.protocol === 'vertexconnect:') return `/${url.host}${url.pathname}`.replace(/\/+$/, '') + url.search || '/';
  if (url.origin !== new URL(web).origin) return null;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  const org = url.searchParams.get('org');
  const withOrg = (route: string) => (org ? `${route}?org=${encodeURIComponent(org)}` : route);

  const lead = url.searchParams.get('lead');
  if (path === '/leads' && lead) return withOrg(`/lead/${encodeURIComponent(lead)}`);
  if (path === '/leads' && !url.searchParams.get('view')) return withOrg('/leads');
  if (path === '/dashboard' || path === '/') return withOrg('/');
  if (path === '/notifications') return '/notifications';
  if (path === '/cards') return withOrg('/cards');
  const card = /^\/cards\/([^/]+)$/.exec(path);
  if (card) return withOrg(`/card/${card[1]}`);
  // Public pages are for visitors, in the browser.
  if (/^\/(c|t|tap|meet)(\/|$)/.test(path)) return null;
  return `/web?path=${encodeURIComponent(path + url.search)}`;
}
