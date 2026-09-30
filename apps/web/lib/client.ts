'use client';

import type { Plan } from '@vertex/shared';
import { API_URL } from './api';
import enCommon from '@/locales/en/common.json';
import arCommon from '@/locales/ar/common.json';

const TOKEN_KEY = 'vertex_token';
const REFRESH_KEY = 'vertex_refresh';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function saveTokens(t: AuthTokens) {
  localStorage.setItem(TOKEN_KEY, t.accessToken);
  localStorage.setItem(REFRESH_KEY, t.refreshToken);
  if (typeof document !== 'undefined') {
    document.cookie = `${TOKEN_KEY}=${t.accessToken}; path=/; max-age=604800; SameSite=Lax`;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

const ACTIVE_ORG_KEY = 'vertex_org_id';

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  // Otherwise the next account to sign in on this browser inherits a
  // "selected organization" that belongs to whoever was signed in before.
  localStorage.removeItem(ACTIVE_ORG_KEY);
  if (typeof document !== 'undefined') {
    document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_ORG_KEY);
}

export function setActiveOrgId(orgId: string | null) {
  if (orgId) {
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
  } else {
    localStorage.removeItem(ACTIVE_ORG_KEY);
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

let renewing: Promise<boolean> | null = null;

/**
 * Trades the refresh token for a fresh pair. An access token lives fifteen
 * minutes, so without this every session ended there, mid-task. Requests that
 * fail together share one renewal.
 */
export function renewSession(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  renewing ??= (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      saveTokens((await res.json()) as AuthTokens);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

/** Where sign-in returns to: a page of this app, never another site. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/^\/(login|register)(\/|\?|$)/.test(next)) return null;
  return next;
}

/**
 * Sends a request with the session, renewing it once if it has expired. Only
 * when it cannot be renewed does the person go back to sign in, returning to
 * this page afterwards.
 */
let leaving = false;

async function withSession(send: (token: string | null) => Promise<Response>): Promise<Response> {
  const sentWith = getToken();
  let res = await send(sentWith);
  if (res.status === 401 && sentWith) {
    // Another request may already have renewed it while this one was out.
    const renewed = getToken() !== sentWith ? !!getToken() : await renewSession();
    if (renewed) res = await send(getToken());
  }
  if (res.status === 401) {
    // The first request to find the session over decides where to go; the
    // ones still in flight must not replace that (and its "session ended").
    if (!leaving && typeof window !== 'undefined') {
      leaving = true;
      logout();
      const here = window.location.pathname + window.location.search;
      window.location.href = `/login?${sentWith ? 'expired=1&' : ''}next=${encodeURIComponent(here)}`;
    }
    throw new Error('Unauthorized');
  }
  return res;
}

/** Downloads a file the API serves only to a signed-in person, under `filename`. */
export async function authDownload(path: string, filename: string): Promise<void> {
  const orgId = getActiveOrgId();
  const res = await withSession((token) =>
    fetch(`${API_URL}${path}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { 'x-organization-id': orgId } : {}),
      },
    }),
  );
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Authenticated fetch against the API. An expired session is renewed; one that cannot be ends in /login. */
/**
 * The workspace's plan has no room for another card, person or chip. Its
 * message is already in the page's language; `resource` says which.
 */
export class PlanLimitError extends Error {
  readonly code = 'plan-limit';
  readonly resource: 'cards' | 'members' | 'nfcTags';
  constructor(data: { resource?: string; limit?: number; plan?: string }) {
    const lang = typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en';
    const strings = (lang === 'ar' ? arCommon : enCommon).planLimit;
    const resource = data.resource === 'members' || data.resource === 'nfcTags' ? data.resource : 'cards';
    const plan = strings.plans[data.plan as keyof typeof strings.plans] ?? data.plan ?? '';
    super(strings[resource].replace('{{plan}}', plan).replace('{{limit}}', String(data.limit ?? '')));
    this.resource = resource;
  }
}

/**
 * Identical reads in flight at the same moment share one request: a page and
 * its shell both ask for /auth/me as they mount, and on a slow phone network
 * each extra round trip queues behind the others. Nothing is kept once the
 * answer is in, so no one ever reads a stale copy.
 */
const inflight = new Map<string, Promise<unknown>>();

export function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || init.body != null || init.signal) return request<T>(path, init);
  const key = `${getActiveOrgId() ?? ''} ${path} ${JSON.stringify(init.headers ?? null)}`;
  const shared = inflight.get(key);
  if (shared) return shared as Promise<T>;
  const p = request<T>(path, init).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const orgId = getActiveOrgId();
  const res = await withSession((token) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { 'x-organization-id': orgId } : {}),
      },
    }),
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (data?.code === 'plan-limit') throw new PlanLimitError(data);
    const message =
      (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(
      Array.isArray(data?.errors) && data.errors.length
        ? data.errors.map((e: { message: string }) => e.message).join(', ')
        : message,
    );
  }
  return data as T;
}

/** Sends a file (as multipart form data, field "file") to an API route and reads the JSON answer. */
export async function authPostFile<T>(path: string, file: Blob, filename: string): Promise<T> {
  const orgId = getActiveOrgId();
  const res = await withSession((token) => {
    const form = new FormData();
    form.append('file', file, filename);
    return fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'x-organization-id': orgId } : {}) },
      body: form,
    });
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/**
 * Uploads an image file to the API and returns its public URL.
 * Sends multipart/form-data with the auth token — do NOT set Content-Type
 * manually; the browser adds the multipart boundary.
 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await withSession((token) =>
    fetch(`${API_URL}/uploads`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }),
  );
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `Upload failed (${res.status})`);
  }
  return (data as { url: string }).url;
}

/**
 * Creates an empty card and hands back its id. Nothing is asked for up front —
 * the editor's guided start collects the name, contact channels, and style, so
 * there is one place that onboards a card rather than two.
 */
/**
 * A new, empty card. In an organization it starts from the workspace's
 * defaults (brand colour and card language, set in Workspace settings); if
 * those cannot be read, it starts from the house defaults as before.
 */
export async function createBlankCard(): Promise<Card> {
  const theme: Record<string, unknown> = {};
  if (getActiveOrgId()) {
    try {
      const org = await authFetch<{ branding: Record<string, unknown> | null; settings: Record<string, unknown> | null }>('/orgs/current');
      const accent = org.branding?.accent;
      const lang = org.settings?.language;
      if (typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent)) theme.accent = accent;
      if (lang === 'en' || lang === 'ar') theme.lang = lang;
    } catch {
      // Defaults are a convenience; never block creating a card on them.
    }
  }
  return authFetch<Card>('/cards', {
    method: 'POST',
    body: JSON.stringify({ templateId: 'swiss-blue', ...(Object.keys(theme).length ? { theme } : {}) }),
  });
}

/** A refused sign-in call. `status` says why; 0 means the server could not be reached. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds until the API accepts another attempt, when it said. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

async function authPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('Could not reach the server', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      Array.isArray(data?.errors) && data.errors.length
        ? data.errors.map((e: { message: string }) => e.message).join(', ')
        : data?.message || `Request failed (${res.status})`;
    throw new AuthError(message, res.status, typeof data?.retryAfter === 'number' ? data.retryAfter : undefined);
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const data = await authPost<AuthTokens>('login', { email: email.trim(), password });
  saveTokens(data);
  // A stale x-organization-id from whoever was signed in before this account
  // would otherwise override the org this JWT actually belongs to.
  setActiveOrgId(null);
  return data;
}

export async function register(input: {
  email: string;
  password: string;
  name?: string;
  organizationName: string;
}) {
  const data = await authPost<AuthTokens>('register', {
    ...input,
    email: input.email.trim(),
    name: input.name?.trim() || undefined,
    organizationName: input.organizationName.trim(),
  });
  saveTokens(data);
  setActiveOrgId(null);
  return data;
}

/** Signs in (or up) with the ID token "Sign in with Google" gave the page. */
export async function googleSignIn(credential: string) {
  const data = await authPost<AuthTokens>('google', { credential });
  saveTokens(data);
  setActiveOrgId(null);
  return data;
}

/** The sign-in methods the server offers besides email and password. */
export async function authProviders(): Promise<{ google: string | null }> {
  try {
    const res = await fetch(`${API_URL}/auth/providers`);
    return res.ok ? await res.json() : { google: null };
  } catch {
    return { google: null };
  }
}

/** Succeeds whether or not the address has an account; fails only when the request does. */
export async function forgotPassword(email: string) {
  await authPost('forgot-password', { email: email.trim() });
}

export async function resetPassword(token: string, password: string) {
  await authPost('reset-password', { token, password });
}

export async function acceptInvite(token: string, password: string, name?: string) {
  const data = await authPost<AuthTokens>('accept-invite', { token, password, name: name?.trim() || undefined });
  saveTokens(data);
  setActiveOrgId(null);
  return data;
}

// --- Resource types ---
export interface Card {
  id: string;
  slug: string;
  ownerId: string;
  orgId: string;
  templateId: string;
  theme: Record<string, unknown> | null;
  vcardData: Record<string, unknown> | null;
  isPublished: boolean;
  createdAt: string;
  sections?: Section[];
  actions?: CardAction[];
}

export interface Section {
  id: string;
  type: 'BIO' | 'SOCIAL' | 'PORTFOLIO' | 'BOOKING' | 'VIDEO' | 'CREDENTIALS' | 'CLIENTS';
  order: number;
  isVisible: boolean;
  content: Record<string, unknown>;
}

export interface CardAction {
  id: string;
  type: string;
  order: number;
  isActive: boolean;
  config: Record<string, unknown>;
}

export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface InviteMemberResult {
  status: 'invited' | 'added';
  email: string;
  /** False means the invite/notice email could not be delivered — the
   * membership and (for a new invite) its link still exist, so the caller
   * should tell the Owner to try sending again rather than report failure. */
  emailSent: boolean;
}

export function inviteMember(input: {
  email: string;
  name?: string;
  role: Role;
  teamId?: string;
}): Promise<InviteMemberResult> {
  return authFetch<InviteMemberResult>('/orgs/members/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface Member {
  id: string;
  role: Role;
  status: string;
  teamId: string | null;
  user: { id: string; name: string | null; email: string; avatarUrl?: string | null };
  team: { id: string; name: string } | null;
}

export interface Team {
  id: string;
  name: string;
  managerId: string | null;
  manager: { id: string; name: string | null; email: string; avatarUrl?: string | null } | null;
  _count: { memberships: number };
}

export interface Me {
  sub: string;
  id: string;
  email: string;
  name?: string | null;
  /** The user's own account photo — independent of any card artwork. */
  avatarUrl?: string | null;
  orgId?: string;
  role?: Role;
  isSuperAdmin?: boolean;
  /** Active workspace's plan. A personal workspace is always FREE. */
  plan?: Plan;
  /** Earned by a paid plan — computed server-side, never self-declared. */
  verified?: boolean;
}

export interface NfcTag {
  id: string;
  uid: string;
  status: 'UNASSIGNED' | 'ACTIVE' | 'DISABLED';
  hardwareType: 'CARD' | 'STICKER' | 'KEYCHAIN' | 'WRISTBAND' | 'OTHER';
  batchId: string | null;
  cardId: string | null;
  /** The member this piece of hardware belongs to — what reporting counts by. */
  assignedUserId: string | null;
  assignedUser?: { id: string; name: string | null; email: string } | null;
  activationCount: number;
  lastScanAt: string | null;
  createdAt: string;
}

/** One chip's standing over a date range, from /analytics/nfc-tags. */
export interface TagPerformance {
  tagId: string;
  uid: string;
  hardwareType: string | null;
  holder: { id: string; name: string | null; email: string } | null;
  cardSlug: string | null;
  scans: number;
  /** Distinct people reached, not taps — one person tapping twice is one. */
  visitors: number;
  leads: number;
  lastScanAt: string | null;
}

/** A team member's standing for the hardware they carry, from /analytics/members. */
export interface MemberPerformance {
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
  tags: number;
  scans: number;
  visitors: number;
  leads: number;
  wonLeads: number;
  wonValue: number;
}
