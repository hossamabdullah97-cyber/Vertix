/**
 * Every link on a card that belongs to an app opens that app on a phone,
 * instead of a browser tab: social networks, messaging, maps, meetings and
 * payments (InstaPay, PayPal). Calls (tel:), email (mailto:) and SMS already
 * open their apps by their scheme, so they are left alone.
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

/** An app, by the addresses it opens (`path` narrows a shared host such as google.com). */
type App = { host: RegExp; path?: RegExp; pkg: string };
const APPS: App[] = [
  // Messaging
  { host: /^(wa\.me|(api|www|chat)\.whatsapp\.com)$/i, pkg: 'com.whatsapp' },
  { host: /^(t\.me|telegram\.me)$/i, pkg: 'org.telegram.messenger' },
  { host: /^(m\.me|(www\.)?messenger\.com)$/i, pkg: 'com.facebook.orca' },
  { host: /^(discord\.gg|(www\.)?discord\.com)$/i, pkg: 'com.discord' },
  // Social
  { host: /^([a-z]{2,3}\.|www\.)?linkedin\.com$/i, pkg: 'com.linkedin.android' },
  { host: /^((www|m|web)\.)?facebook\.com$|^fb\.(com|me)$/i, pkg: 'com.facebook.katana' },
  { host: /^(www\.)?instagram\.com$|^instagr\.am$/i, pkg: 'com.instagram.android' },
  { host: /^(www\.)?threads\.(net|com)$/i, pkg: 'com.instagram.barcelona' },
  { host: /^((www|mobile)\.)?(x|twitter)\.com$/i, pkg: 'com.twitter.android' },
  { host: /^((www|m|vm|vt)\.)?tiktok\.com$/i, pkg: 'com.zhiliaoapp.musically' },
  { host: /^((www|m)\.)?youtube\.com$|^youtu\.be$/i, pkg: 'com.google.android.youtube' },
  { host: /^((www|story)\.)?snapchat\.com$/i, pkg: 'com.snapchat.android' },
  { host: /^((www|[a-z]{2})\.)?pinterest\.[a-z.]+$|^pin\.it$/i, pkg: 'com.pinterest' },
  { host: /^(www\.)?behance\.net$/i, pkg: 'com.behance.behance' },
  { host: /^((www|old)\.)?reddit\.com$/i, pkg: 'com.reddit.frontpage' },
  { host: /^(www\.)?github\.com$/i, pkg: 'com.github.android' },
  // Maps
  { host: /^maps\.(google\.[a-z.]+|app\.goo\.gl)$/i, pkg: 'com.google.android.apps.maps' },
  { host: /^(www\.)?google\.[a-z.]+$/i, path: /^\/maps/i, pkg: 'com.google.android.apps.maps' },
  { host: /^goo\.gl$/i, path: /^\/maps/i, pkg: 'com.google.android.apps.maps' },
  // Meetings
  { host: /^([a-z0-9-]+\.)?zoom\.us$/i, pkg: 'us.zoom.videomeetings' },
  { host: /^meet\.google\.com$/i, pkg: 'com.google.android.apps.tachyon' },
  { host: /^teams\.(microsoft|live)\.com$/i, pkg: 'com.microsoft.teams' },
  // Payments: InstaPay's links open only in its app.
  { host: /^(www\.)?ipn\.eg$/i, pkg: 'com.egyptianbanks.instapay' },
  { host: /^(www\.)?paypal\.(me|com)$/i, pkg: 'com.paypal.android.p2pmobile' },
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
  const app = APPS.find((a) => a.host.test(url.hostname) && (!a.path || a.path.test(url.pathname)));
  if (!app) return null;
  const https = `https://${url.host}${url.pathname}${url.search}`;
  if (platform === 'ios') return https;
  if (platform === 'android') {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${app.pkg};S.browser_fallback_url=${encodeURIComponent(https)};end`;
  }
  return null;
}
