import { API_URL } from '@/lib/api';

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
