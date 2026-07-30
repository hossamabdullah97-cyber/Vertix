'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';

/** Fires a VIEW event for the public card on mount (persistent anonymous visitor id). */
export default function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    const key = 'vertex_visitor';
    let v = localStorage.getItem(key);
    if (!v) {
      v =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem(key, v);
    }
    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, type: 'VIEW', visitorId: v }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
