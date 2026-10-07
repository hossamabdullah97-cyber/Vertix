import { api, publicApi } from './api';
import { TAP_BASE } from './config';

/** Same rule as normalizeUid in @vertex/shared: hex serials as "04:A1:B2…". */
export function normalizeUid(raw: string): string {
  const value = raw.trim();
  const hex = value.replace(/[\s:-]/g, '');
  if (/^[0-9a-f]+$/i.test(hex) && hex.length >= 8 && hex.length % 2 === 0) return hex.toUpperCase().match(/../g)!.join(':');
  return value;
}

/** What a chip with this serial carries: the same address the web's chip programmer writes. */
export const tapUrl = (uid: string) => `${TAP_BASE}/t/${normalizeUid(uid).replace(/:/g, '')}`;

interface Tag {
  id: string;
  uid: string;
}

/** Registers a chip (already registered is fine) and gives it to a card. */
export async function registerAndAssign(uid: string, cardId: string) {
  try {
    await api('/nfc/tags', { method: 'POST', json: { uid } });
  } catch {
    // Already this workspace's: it is found below.
  }
  const tags = await api<Tag[]>('/nfc/tags');
  const tag = tags.find((t) => normalizeUid(t.uid) === normalizeUid(uid));
  if (!tag) throw new Error('CHIP_NOT_FOUND');
  await api(`/nfc/tags/${tag.id}/assign`, { method: 'POST', json: { cardId } });
}

export interface Resolution {
  tagUid: string;
  cardSlug: string;
  redirectUrl: string;
}

/** Which card a chip opens, as anyone tapping it would see. */
export function resolveTag(uid: string) {
  return publicApi<Resolution>(`/t/${encodeURIComponent(normalizeUid(uid))}/resolve`);
}
