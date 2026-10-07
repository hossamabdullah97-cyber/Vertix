import { Platform } from 'react-native';
import { API_BASE } from './config';
import { secrets } from './storage';

/** The same names the website keeps its session under, so a page opened in the app shares it. */
export const KEYS = { token: 'vertex_token', refresh: 'vertex_refresh', org: 'vertex_org_id' } as const;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TwoStepChallenge {
  mfaRequired: true;
  mfaToken: string;
}

/** A refused request, with the server's own words and its status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

let session: { token: string | null; refresh: string | null; org: string | null } | null = null;
const listeners = new Set<() => void>();

/** Told when the session ends (signed out, or renewal refused): the app goes back to sign-in. */
export function onSignedOut(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function current() {
  if (!session) {
    const [token, refresh, org] = await Promise.all([secrets.get(KEYS.token), secrets.get(KEYS.refresh), secrets.get(KEYS.org)]);
    session = { token, refresh, org };
  }
  return session;
}

export async function saveTokens(t: AuthTokens) {
  const s = await current();
  s.token = t.accessToken;
  s.refresh = t.refreshToken;
  await Promise.all([secrets.set(KEYS.token, t.accessToken), secrets.set(KEYS.refresh, t.refreshToken)]);
}

export async function hasSession(): Promise<boolean> {
  return !!(await current()).token;
}

export async function sessionTokens() {
  return current();
}

export async function setActiveOrg(orgId: string | null) {
  const s = await current();
  s.org = orgId;
  await secrets.set(KEYS.org, orgId);
}

export async function activeOrg(): Promise<string | null> {
  return (await current()).org;
}

async function clearSession() {
  session = { token: null, refresh: null, org: null };
  await Promise.all([secrets.set(KEYS.token, null), secrets.set(KEYS.refresh, null), secrets.set(KEYS.org, null)]);
}

/**
 * Which app is asking, so the device list in Settings can name it ("Vertex
 * app on iPhone"). A browser sets its own, so the web build leaves it be.
 */
const USER_AGENT =
  Platform.OS === 'ios'
    ? `VertexConnectApp/1.0 (${Platform.isPad ? 'iPad' : 'iPhone'}; iOS ${Platform.Version}; Mobile)`
    : Platform.OS === 'android'
      ? `VertexConnectApp/1.0 (Linux; Android ${Platform.Version}; Mobile)`
      : null;

async function send(path: string, init: RequestInit & { json?: unknown } = {}, token: string | null, org: string | null) {
  const { json, ...rest } = init;
  const isForm = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined || (rest.body && !isForm) ? { 'Content-Type': 'application/json' } : {}),
      ...(USER_AGENT ? { 'User-Agent': USER_AGENT } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { 'x-organization-id': org } : {}),
      ...((rest.headers as Record<string, string>) ?? {}),
    },
  });
}

async function read<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const body = (data && typeof data === 'object' ? data : {}) as { message?: unknown; code?: string };
    const message = Array.isArray(body.message) ? body.message.join(', ') : typeof body.message === 'string' ? body.message : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body.code);
  }
  return data as T;
}

let renewing: Promise<boolean> | null = null;

/** Trades the refresh token for a fresh pair; requests that fail together share one renewal. */
export function renewSession(): Promise<boolean> {
  renewing ??= (async () => {
    const s = await current();
    if (!s.refresh) return false;
    try {
      const res = await send('/auth/refresh', { method: 'POST', json: { refreshToken: s.refresh } }, null, null);
      if (!res.ok) return false;
      await saveTokens((await res.json()) as AuthTokens);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

/**
 * A request as the signed-in person, in the open workspace. An expired token
 * is renewed once; a session that cannot be renewed is ended.
 */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const s = await current();
  let res = await send(path, init, s.token, s.org);
  if (res.status === 401 && s.refresh) {
    if (await renewSession()) {
      const again = await current();
      res = await send(path, init, again.token, again.org);
    }
    if (res.status === 401) {
      await clearSession();
      listeners.forEach((fn) => fn());
    }
  }
  return read<T>(res);
}

/** A request nobody needs to be signed in for. */
export async function publicApi<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  return read<T>(await send(path, init, null, null));
}

// ---- Signing in and out ----

export async function login(email: string, password: string): Promise<TwoStepChallenge | null> {
  const data = await publicApi<AuthTokens | TwoStepChallenge>('/auth/login', { method: 'POST', json: { email: email.trim(), password } });
  if ('mfaRequired' in data) return data;
  await saveTokens(data);
  await setActiveOrg(null);
  return null;
}

/** Sign in with Apple (iOS): Apple's token, the nonce it was asked for, and the name Apple shares the first time. */
export async function appleLogin(identityToken: string, nonce: string, name?: string): Promise<TwoStepChallenge | null> {
  const data = await publicApi<AuthTokens | TwoStepChallenge>('/auth/apple', { method: 'POST', json: { identityToken, nonce, ...(name ? { name } : {}) } });
  if ('mfaRequired' in data) return data;
  await saveTokens(data);
  await setActiveOrg(null);
  return null;
}

export async function completeTwoStep(mfaToken: string, code: string) {
  const data = await publicApi<AuthTokens>('/auth/login/2fa', { method: 'POST', json: { mfaToken, code: code.trim() } });
  await saveTokens(data);
  await setActiveOrg(null);
}

/** Ends the session on the server too, so the refresh token left behind renews nothing. */
export async function logout() {
  const s = await current();
  if (s.refresh) await publicApi('/auth/logout', { method: 'POST', json: { refreshToken: s.refresh } }).catch(() => undefined);
  await clearSession();
  listeners.forEach((fn) => fn());
}
