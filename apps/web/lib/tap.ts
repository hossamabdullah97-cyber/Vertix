import { normalizeUid } from '@vertex/shared';

/**
 * The address written on a chip. It names the web app's /t route, not the
 * API, so the API can move without a chip in the field going dead; set
 * NEXT_PUBLIC_TAP_URL to a short domain of your own (https://vtx.link) that
 * points at this app, and keep it for good: it is printed, in effect, on every
 * chip you ship. The serial goes in without colons, which keeps the URL short.
 */
export function tapUrl(uid: string): string {
  const base =
    process.env.NEXT_PUBLIC_TAP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${base.replace(/\/+$/, '')}/t/${normalizeUid(uid).replace(/:/g, '')}`;
}

/** Whether chips point at a dedicated tap domain (safe to lock for good). */
export const HAS_TAP_DOMAIN = !!process.env.NEXT_PUBLIC_TAP_URL;

/** The visitor id the public card and the /t route share, as a first-party cookie. */
export const VISITOR_COOKIE = 'vertex_visitor';
