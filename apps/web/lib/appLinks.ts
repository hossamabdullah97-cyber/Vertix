/**
 * "Open in the visitor's app": WhatsApp and LinkedIn links handed to their
 * apps on a phone instead of a browser tab.
 *
 * Android gets an intent link, which opens the app and falls back to the web
 * page by itself when the app is not installed. iOS has no such fallback: a
 * custom scheme for an app that is not installed shows "address is invalid".
 * So on iOS the ordinary https link is opened in the same tab, where iOS hands
 * it to the app when it is installed (universal links) and shows the page
 * when it is not.
 */

export type Platform = 'ios' | 'android' | 'other';

export function platformOf(ua: string, touchPoints = 0): Platform {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS reports itself as a Mac; only the touch screen tells them apart.
  if (/macintosh/i.test(ua) && touchPoints > 1) return 'ios';
  return 'other';
}

type App = { host: RegExp; pkg: string };
const APPS: App[] = [
  { host: /^(wa\.me|(api|www)\.whatsapp\.com)$/i, pkg: 'com.whatsapp' },
  { host: /^([a-z]{2,3}\.|www\.)?linkedin\.com$/i, pkg: 'com.linkedin.android' },
];

/** The link to navigate to on this platform, or null to leave the link as it is. */
export function appLink(href: string, platform: Platform): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const app = APPS.find((a) => a.host.test(url.hostname));
  if (!app) return null;
  const https = `https://${url.host}${url.pathname}${url.search}`;
  if (platform === 'ios') return https;
  if (platform === 'android') {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${app.pkg};S.browser_fallback_url=${encodeURIComponent(https)};end`;
  }
  return null;
}
