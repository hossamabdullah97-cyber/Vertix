import { API_URL } from '@/lib/api';
import { VISITOR_COOKIE } from '@/lib/tap';

type TrackBody = { slug: string; type: 'VIEW' | 'CLICK' | 'SAVE' | 'SHARE'; visitorId?: string; metadata?: Record<string, unknown> };

/**
 * Sends a card event, best-effort. When this browser is signed in to the app,
 * its session goes along so the API can leave out the card's own people: an
 * owner opening their card, or a colleague checking it, is not a visitor.
 * It only ever stops an event being counted; it opens nothing.
 */
export function sendTrack(body: TrackBody) {
  let viewer: string | null = null;
  try {
    viewer = localStorage.getItem('vertex_token');
  } catch {
    // storage blocked: counted as anyone else
  }
  try {
    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...(viewer ? { viewer } : {}) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

const readCookie = () => document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]*)`))?.[1];

/**
 * This browser's anonymous visitor id, made the first time it is needed. It
 * lives in a cookie (which the /t route reads when a chip is tapped) and in
 * storage, so the tap that opened a card and the view it led to are one visitor.
 */
export function visitorId(): string {
  let v: string | null | undefined;
  try {
    v = readCookie() || localStorage.getItem(VISITOR_COOKIE);
  } catch {
    v = readCookie();
  }
  if (!v) {
    v = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  }
  try {
    localStorage.setItem(VISITOR_COOKIE, v);
  } catch {
    // private mode: the cookie still carries it
  }
  document.cookie = `${VISITOR_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  return v;
}

let claimed = false;

/**
 * Tells the API this browser is signed in to the app, once per page load, so a
 * chip it taps is counted as the workspace's own and left out (an owner trying
 * their card, a colleague checking a chip). Best-effort; it opens nothing.
 */
export function claimThisBrowser() {
  if (claimed) return;
  let viewer: string | null = null;
  try {
    viewer = localStorage.getItem('vertex_token');
  } catch {
    return;
  }
  if (!viewer) return;
  claimed = true;
  try {
    fetch(`${API_URL}/track/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: visitorId(), viewer }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
