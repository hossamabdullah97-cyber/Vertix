'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { VISITOR_COOKIE } from '@/lib/tap';

const readCookie = () => document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]*)`))?.[1];

/**
 * Fires a VIEW event for the public card on mount (persistent anonymous visitor id).
 * The id is shared with the /t route through a cookie, so the tap that opened
 * this card and the view it led to belong to the same visitor.
 */
export default function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    const key = VISITOR_COOKIE;
    let v: string | null | undefined;
    try {
      v = readCookie() || localStorage.getItem(key);
    } catch {
      v = readCookie();
    }
    if (!v) {
      v =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2);
    }
    try {
      localStorage.setItem(key, v);
    } catch {
      // private mode: the cookie still carries it
    }
    document.cookie = `${VISITOR_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, type: 'VIEW', visitorId: v }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
