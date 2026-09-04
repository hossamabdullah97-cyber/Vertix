'use client';

import type { Plan } from '@vertex/shared';
import { API_URL } from './api';

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

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  if (typeof document !== 'undefined') {
    document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

const ACTIVE_ORG_KEY = 'vertex_org_id';

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

/** Authenticated fetch against the API. On 401 it clears the session and redirects to /login. */
export async function authFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const orgId = getActiveOrgId();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
    },
  });

  if (res.status === 401) {
    logout();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
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

/**
 * Uploads an image file to the API and returns its public URL.
 * Sends multipart/form-data with the auth token — do NOT set Content-Type
 * manually; the browser adds the multipart boundary.
 */
export async function uploadImage(file: File): Promise<string> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401) {
    logout();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
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
export async function createBlankCard(): Promise<Card> {
  return authFetch<Card>('/cards', {
    method: 'POST',
    body: JSON.stringify({ templateId: 'swiss-blue' }),
  });
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Invalid credentials');
  saveTokens(data);
  return data as AuthTokens;
}

export async function register(input: {
  email: string;
  password: string;
  name?: string;
  organizationName: string;
}) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      Array.isArray(data?.errors) && data.errors.length
        ? data.errors.map((e: { message: string }) => e.message).join(', ')
        : data.message || 'Registration failed',
    );
  }
  saveTokens(data);
  return data as AuthTokens;
}

export async function forgotPassword(email: string) {
  await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Reset failed');
}

export async function acceptInvite(token: string, password: string, name?: string) {
  const res = await fetch(`${API_URL}/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Could not accept invitation');
  saveTokens(data);
  return data as AuthTokens;
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
  type: 'BIO' | 'SOCIAL' | 'PORTFOLIO' | 'BOOKING' | 'VIDEO';
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
  activationCount: number;
  lastScanAt: string | null;
  createdAt: string;
}
