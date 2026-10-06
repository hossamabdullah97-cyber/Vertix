'use client';

import type { Plan, SsoCallbackResult, SsoConnectionInput, SsoSettingsInput, SsoView } from '@vertex/shared';
import { API_URL } from './api';
import enCommon from '@/locales/en/common.json';
import arCommon from '@/locales/ar/common.json';
import { ApiError } from './apiErrors';
import { clearOutbox, hold, isOffline, isUnreachable, startOutbox } from './outbox';
import { forgetWorkspaces, knownRequestedId } from './workspaces';

export { ApiError, apiMessageOf } from './apiErrors';

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
  // The device's session ends on the server too, so the refresh token left
  // behind (a shared computer, a copied profile) renews nothing. It outlives
  // the page that is navigating away.
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
  if (refreshToken) {
    try {
      void Promise.resolve(
        fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          keepalive: true,
        }),
      ).catch(() => undefined);
    } catch {
      // Signing out here never waits on, or fails with, the server.
    }
  }
  // Changes still waiting for a connection belong to this account, not the next one.
  clearOutbox();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  // Otherwise the next account to sign in on this browser inherits a
  // "selected organization" that belongs to whoever was signed in before.
  localStorage.removeItem(ACTIVE_ORG_KEY);
  forgetWorkspaces();
  // The cards "Met someone" keeps for showing without a signal.
  localStorage.removeItem('vertex_meet_cards');
  localStorage.removeItem('vertex_meet_card');
  if (typeof document !== 'undefined') {
    document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  // A link that names one of this person's workspaces opens there, before
  // the page asks for anything (lib/workspaces.ts).
  const asked = knownRequestedId();
  if (asked && asked !== localStorage.getItem(ACTIVE_ORG_KEY)) localStorage.setItem(ACTIVE_ORG_KEY, asked);
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

/** A request that never got an answer (offline, server down) fails in the page's language; a cancelled one stays an AbortError. */
async function reach(sent: Promise<Response>): Promise<Response> {
  try {
    return await sent;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server', 0);
  }
}

async function withSession(send: (token: string | null) => Promise<Response>): Promise<Response> {
  const sentWith = getToken();
  let res = await reach(send(sentWith));
  if (res.status === 401 && sentWith) {
    // Another request may already have renewed it while this one was out.
    const renewed = getToken() !== sentWith ? !!getToken() : await renewSession();
    if (renewed) res = await reach(send(getToken()));
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
    throw new ApiError('Unauthorized', 401);
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

/** The error for a refused call, in the page's language (see apiErrors.ts). */
function refused(data: { message?: unknown; error?: unknown; errors?: unknown } | null, status: number, what: 'Request' | 'Upload'): ApiError {
  const fields = Array.isArray(data?.errors) ? data.errors.map((e: { message?: string }) => e?.message).filter((m): m is string => !!m) : [];
  const raw = data?.message ?? data?.error;
  const message = typeof raw === 'string' && raw ? raw : `${what} failed (${status})`;
  return new ApiError(fields.length ? fields.join(', ') : message, status, fields);
}

/**
 * Identical reads in flight at the same moment share one request: a page and
 * its shell both ask for /auth/me as they mount, and on a slow phone network
 * each extra round trip queues behind the others. Nothing is kept once the
 * answer is in, so no one ever reads a stale copy.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * The last answer to each read, so a page opened again can show what it
 * showed before (see `peek`) while it asks again. A change to a resource
 * forgets every read under the same first path segment (a PATCH to
 * /cards/1 forgets /cards and /cards/1), so a page never starts from a list
 * that no longer matches. Sign-out and a workspace switch reload the page,
 * which clears it; answers are kept per workspace besides.
 */
const lastSeen = new Map<string, unknown>();
// Writes that change nothing a page reads back: a card studio's "I am here" beat.
const KEEPS_READS = [/^\/cards\/[^/]+\/presence$/];
const seenKey = (path: string) => `${getActiveOrgId() ?? ''} ${path}`;
const rootOf = (path: string) => path.split(/[/?]/)[1] ?? '';

/** The last answer to GET `path` in this workspace, if the app has one; nothing is fetched. */
export function peek<T>(path: string): T | undefined {
  return lastSeen.get(seenKey(path)) as T | undefined;
}

/** Records what a page knows `path` now reads, after changes it made itself; the next read replaces it. */
export function remember(path: string, data: unknown) {
  lastSeen.set(seenKey(path), data);
}

function forget(path: string) {
  const org = `${getActiveOrgId() ?? ''} `;
  const root = rootOf(path);
  for (const key of lastSeen.keys()) if (key.startsWith(org) && rootOf(key.slice(org.length)) === root) lastSeen.delete(key);
}

/**
 * A change, or a wait in the outbox (lib/outbox.ts) when there is no
 * connection: anything while the browser is offline, since it never left;
 * a PATCH, PUT or DELETE whose connection failed, since sending it twice is
 * harmless. A POST whose connection failed may have arrived, so it fails.
 */
function write<T>(path: string, init: RequestInit, method: string): Promise<T> {
  const orgId = getActiveOrgId();
  const body = typeof init.body === 'string' ? init.body : null;
  const holdable = init.body == null || body !== null; // FormData and the like are not kept
  const later = () => hold({ path, method, body, orgId }) as Promise<T>;
  if (holdable && isOffline()) return later();
  return request<T>(path, init, orgId).catch((err) => {
    if (holdable && isUnreachable(err) && method !== 'POST') return later();
    throw err;
  });
}

// What waited in the outbox goes out the same way, to the workspace it was made in.
if (typeof window !== 'undefined') {
  startOutbox((p) => request(p.path, { method: p.method, ...(p.body !== null ? { body: p.body } : {}) }, p.orgId).finally(() => forget(p.path)));
}

export function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    if (KEEPS_READS.some((re) => re.test(path))) return request<T>(path, init);
    // Forgotten on the way out too, so a read made while it is in flight is not kept.
    forget(path);
    return write<T>(path, init, method).finally(() => forget(path));
  }
  if (init.body != null || init.signal) return request<T>(path, init);
  const key = `${getActiveOrgId() ?? ''} ${path} ${JSON.stringify(init.headers ?? null)}`;
  const shared = inflight.get(key);
  if (shared) return shared as Promise<T>;
  const p = request<T>(path, init)
    .then((data) => {
      if (!init.headers) lastSeen.set(seenKey(path), data);
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  orgId: string | null = getActiveOrgId(),
): Promise<T> {
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A proxy's error page rather than the API's answer.
    if (res.ok) throw new ApiError('Could not reach the server', 0);
  }
  if (!res.ok) {
    if (data?.code === 'plan-limit') throw new PlanLimitError(data);
    throw refused(data, res.status, 'Request');
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
    throw refused(data, res.status, 'Request');
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A proxy's error page rather than the API's answer.
    if (res.ok) throw new ApiError('Could not reach the server', 0);
  }
  if (!res.ok) {
    throw refused(data, res.status, 'Upload');
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

/** A right password on an account with two-step verification: the code screen comes next. */
export interface TwoStepChallenge {
  mfaRequired: true;
  mfaToken: string;
}

/** The session, or the challenge the code screen answers (completeTwoStep). */
function startSession(data: AuthTokens | TwoStepChallenge): TwoStepChallenge | null {
  if ('mfaRequired' in data) return data;
  saveTokens(data);
  // A stale x-organization-id from whoever was signed in before this account
  // would otherwise override the org this JWT actually belongs to.
  setActiveOrgId(null);
  return null;
}

/** Signs in; returns the two-step challenge when a code is still needed. */
export async function login(email: string, password: string) {
  return startSession(await authPost<AuthTokens | TwoStepChallenge>('login', { email: email.trim(), password }));
}

/** The second step of a sign-in: the code from the authenticator app, or a recovery code. */
export async function completeTwoStep(mfaToken: string, code: string) {
  startSession(await authPost<AuthTokens>('login/2fa', { mfaToken, code: code.trim() }));
}

export async function register(input: {
  email: string;
  password: string;
  name?: string;
  /** On one's own (a personal workspace) or for a company or team, which then needs its name. */
  kind: 'personal' | 'team';
  organizationName?: string;
}) {
  const data = await authPost<AuthTokens>('register', {
    ...input,
    email: input.email.trim(),
    name: input.name?.trim() || undefined,
    organizationName: input.kind === 'team' ? input.organizationName?.trim() : undefined,
  });
  saveTokens(data);
  setActiveOrgId(null);
  return data;
}

/** Signs in (or up) with the ID token "Sign in with Google" gave the page. */
export async function googleSignIn(credential: string) {
  return startSession(await authPost<AuthTokens | TwoStepChallenge>('google', { credential }));
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

/** Opens an email-confirmation link; the address it confirmed comes back. */
export async function verifyEmail(token: string) {
  return authPost<{ ok: true; email: string }>('verify-email', { token });
}

/** Mails the signed-in account a fresh confirmation link. */
export async function resendVerification() {
  return authFetch<{ ok: true; alreadyVerified?: true; emailSent?: boolean }>('/auth/verify-email/resend', { method: 'POST' });
}

export async function acceptInvite(token: string, password: string, name?: string) {
  return startSession(await authPost<AuthTokens | TwoStepChallenge>('accept-invite', { token, password, name: name?.trim() || undefined }));
}

// --- Two-step verification (the signed-in person's own) ---
export interface TwoStepStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}
export const twoStep = {
  status: () => authFetch<TwoStepStatus>('/auth/2fa'),
  setup: () => authFetch<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { method: 'POST' }),
  enable: (code: string) => authFetch<{ recoveryCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: code.trim() }) }),
  disable: (code: string) => authFetch<{ ok: true }>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code: code.trim() }) }),
  recoveryCodes: (code: string) => authFetch<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', { method: 'POST', body: JSON.stringify({ code: code.trim() }) }),
};

export interface SignedInDevice {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** The devices the account is signed in on (auth_sessions). */
export const devices = {
  list: () => authFetch<SignedInDevice[]>('/auth/sessions'),
  signOut: (id: string) => authFetch<{ ok: true }>(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  signOutOthers: () => authFetch<{ count: number }>('/auth/sessions/revoke-others', { method: 'POST' }),
};

/** Saves data the API returned as a .json file on the person's device. */
export function saveJson(data: unknown, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export interface DeletionPreview {
  deletedWithIt: { id: string; name: string }[];
  blockers: { id: string; name: string; members: number }[];
  leaving: { id: string; name: string; role: Role }[];
  hasPassword: boolean;
  twoFactor: boolean;
}
export const account = {
  export: () => authFetch<unknown>('/account/export'),
  deletion: () => authFetch<DeletionPreview>('/account/deletion'),
  remove: (body: { confirmEmail: string; password?: string; code?: string }) =>
    authFetch<{ ok: true; workspacesDeleted: number }>('/account/delete', { method: 'POST', body: JSON.stringify(body) }),
};

export interface OrgSecurity {
  require2fa: boolean;
  membersWithout: { id: string; name: string | null; email: string; role: Role }[];
}
export const orgSecurity = {
  get: () => authFetch<OrgSecurity>('/orgs/security'),
  set: (require2fa: boolean) => authFetch<OrgSecurity>('/orgs/security', { method: 'PATCH', body: JSON.stringify({ require2fa }) }),
};

export const ssoSettings = {
  get: () => authFetch<SsoView>('/orgs/sso'),
  save: (body: SsoConnectionInput) => authFetch<SsoView>('/orgs/sso', { method: 'PUT', body: JSON.stringify(body) }),
  set: (body: SsoSettingsInput) => authFetch<SsoView>('/orgs/sso', { method: 'PATCH', body: JSON.stringify(body) }),
  remove: () => authFetch<SsoView>('/orgs/sso', { method: 'DELETE' }),
  addDomain: (domain: string) => authFetch<SsoView>('/orgs/sso/domains', { method: 'POST', body: JSON.stringify({ domain }) }),
  verifyDomain: (id: string) => authFetch<SsoView>(`/orgs/sso/domains/${id}/verify`, { method: 'POST' }),
  removeDomain: (id: string) => authFetch<SsoView>(`/orgs/sso/domains/${id}`, { method: 'DELETE' }),
  /** Sends the admin to the provider to try the setup; they come back to /sso/callback. */
  test: async () => goToProvider((await authFetch<{ url: string }>('/orgs/sso/test', { method: 'POST' })).url, null, true),
};

// --- Single sign-on ---
// The sign-in's state is kept in this tab while the person is at their
// company's provider, and the one that comes back must be it: a link to the
// callback that someone else started cannot sign this browser into their account.
const SSO_KEY = 'vertex_sso';

function goToProvider(url: string, next: string | null, test = false) {
  const state = new URL(url).searchParams.get('state');
  try {
    sessionStorage.setItem(SSO_KEY, JSON.stringify({ state, next, test }));
  } catch {
    /* no storage: the callback will say this browser did not start it */
  }
  window.location.assign(url);
}

/** Sends someone who typed their work address to their company's provider. */
export async function ssoStart(email: string, next: string | null) {
  const { url } = await authPost<{ url: string }>('sso/start', { email: email.trim() });
  goToProvider(url, next);
}

export class SsoNotStartedHere extends Error {}

/** Back from the provider: signs in, or reports a test's result. */
export async function ssoFinish(code: string, state: string): Promise<{ tested: string | null; next: string | null }> {
  let kept: { state?: string; next?: string | null; test?: boolean } = {};
  try {
    kept = JSON.parse(sessionStorage.getItem(SSO_KEY) || '{}');
    sessionStorage.removeItem(SSO_KEY);
  } catch {
    /* treated as not started here */
  }
  if (!kept.state || kept.state !== state) throw new SsoNotStartedHere();
  const result = await authPost<SsoCallbackResult>('sso/callback', { code, state });
  if ('tested' in result) return { tested: result.email, next: null };
  startSession(result);
  return { tested: null, next: kept.next ?? null };
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
  /** A role the workspace made, if they hold one. */
  customRole?: { id: string; name: string } | null;
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
  /** A role the workspace made, on top of `role`. */
  customRole?: { id: string; name: string; capabilities: string[] } | null;
  isSuperAdmin?: boolean;
  /** Active workspace's plan. A personal workspace is always FREE. */
  plan?: Plan;
  /** Earned by a paid plan — computed server-side, never self-declared. */
  verified?: boolean;
  /** Whether the account has confirmed its email address (needed to invite or pay). */
  emailVerified?: boolean;
  /** Whether the account signs in with a code from an authenticator app too. */
  twoFactorEnabled?: boolean;
  /** Whether the active workspace requires that of its members (met by signing in through its single sign-on too). */
  twoFactorRequired?: boolean;
  /** Whether the active workspace requires its single sign-on of this person, and this device signed in otherwise. */
  ssoRequired?: boolean;
  /** The active workspace: a person's own, or a company's or team's. */
  workspaceKind?: 'PERSONAL' | 'TEAM' | null;
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
