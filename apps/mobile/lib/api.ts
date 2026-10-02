import * as SecureStore from 'expo-secure-store';

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * The base of the address written on a chip: the web app (or a short tap
 * domain pointing at it) that the web's chip programmer writes too, so a chip
 * reads the same whichever programmed it. Without one set, the API's own
 * gateway, which works but ties the chip to the API's address.
 */
export const TAP_BASE = process.env.EXPO_PUBLIC_TAP_URL ?? API_BASE;

/** Same rule as normalizeUid in @vertex/shared: hex serials as "04:A1:B2…". */
export function normalizeUid(raw: string): string {
  const value = raw.trim();
  const hex = value.replace(/[\s:-]/g, '');
  if (/^[0-9a-f]+$/i.test(hex) && hex.length >= 8 && hex.length % 2 === 0) {
    return hex.toUpperCase().match(/../g)!.join(':');
  }
  return value;
}

/** What a chip with this serial carries. */
export const tapUrl = (uid: string) => `${TAP_BASE.replace(/\/+$/, '')}/t/${normalizeUid(uid).replace(/:/g, '')}`;

const TOKEN_KEY = 'vertex_token';

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  await saveToken(data.accessToken);
  return data as { accessToken: string; refreshToken: string };
}

export async function authFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data as T;
}

// --- Types (kept local to avoid RN/Metro workspace resolution issues) ---
export interface Card {
  id: string;
  slug: string;
  templateId: string;
  isPublished: boolean;
}

export interface NfcTag {
  id: string;
  uid: string;
  status: string;
  cardId: string | null;
}

export interface NfcResolution {
  tagUid: string;
  cardSlug: string;
  action: { type: string; target: string } | null;
  redirectUrl: string;
  visitorId: string;
}

export const listCards = () => authFetch<Card[]>('/cards');
export const listTags = () => authFetch<NfcTag[]>('/nfc/tags');

/** Public gateway resolution for a scanned tag uid. */
export async function resolveTag(uid: string): Promise<NfcResolution> {
  const res = await fetch(`${API_BASE}/t/${encodeURIComponent(uid)}/resolve`);
  if (!res.ok) throw new Error('Tag is not registered or is disabled');
  return res.json();
}

/** Registers a tag (ignoring "already exists") and assigns it to a card. */
export async function registerAndAssign(uid: string, cardId: string) {
  try {
    await authFetch('/nfc/tags', { method: 'POST', body: JSON.stringify({ uid }) });
  } catch {
    // tag may already exist for this org — fall through to assignment
  }
  const tags = await listTags();
  // The API stores the serial in its normal form, whatever spelling it got.
  const tag = tags.find((t) => normalizeUid(t.uid) === normalizeUid(uid));
  if (!tag) throw new Error('Could not locate the registered tag');
  await authFetch(`/nfc/tags/${tag.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ cardId }),
  });
}
