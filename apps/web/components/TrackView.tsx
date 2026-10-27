'use client';

import { useEffect } from 'react';
import { sendTrack, visitorId } from '@/lib/track';

// Once per card per page load. React runs effects twice in development, and a
// remount must not count the same look again.
const counted = new Set<string>();

/**
 * Fires a VIEW event for the public card on mount (persistent anonymous visitor id).
 * The id is shared with the /t route through a cookie, so the tap that opened
 * this card and the view it led to belong to the same visitor.
 */
export default function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    if (counted.has(slug)) return;
    counted.add(slug);
    const v = visitorId();
    // ?via=qr: opened from the QR the owner showed in person ("Met someone").
    sendTrack({ slug, type: 'VIEW', visitorId: v, ...(new URLSearchParams(location.search).get('via') === 'qr' ? { metadata: { via: 'qr' } } : {}) });
  }, [slug]);

  return null;
}
