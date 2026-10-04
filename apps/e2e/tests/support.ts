import { createHmac, randomBytes } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api';
export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const PASSWORD = 'E2e-password-123';

/** A call to the API as someone, in their workspace. */
export async function call<T = any>(path: string, opts: { token?: string; orgId?: string; method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(API + path, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.orgId ? { 'x-organization-id': opts.orgId } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

export interface Account {
  email: string;
  password: string;
  name: string;
  token: string;
  userId: string;
  orgId: string;
  /** Set once a test turns on two-step verification, so the account can still be closed. */
  totpSecret?: string;
  api: <T = any>(path: string, opts?: { method?: string; body?: unknown }) => Promise<{ status: number; data: T }>;
}

/** A fresh person with a workspace of their own, made through the API. */
export async function newAccount(name = 'E2E Owner'): Promise<Account> {
  const email = `e2e-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`;
  const r = await call<{ accessToken: string }>('/auth/register', { body: { email, password: PASSWORD, name, organizationName: `${name} Co` } });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  const claims = JSON.parse(Buffer.from(r.data.accessToken.split('.')[1]!, 'base64url').toString());
  const account: Account = {
    email,
    password: PASSWORD,
    name,
    token: r.data.accessToken,
    userId: claims.sub,
    orgId: claims.orgId,
    api: (path, opts = {}) => call(path, { ...opts, token: account.token, orgId: account.orgId }),
  };
  return account;
}

/** Closes the account (and the workspace only it uses), as a person would. */
export async function closeAccount(a: Account) {
  const body: Record<string, string> = { confirmEmail: a.email, password: a.password };
  if (a.totpSecret) {
    // A code from a step no earlier sign-in used.
    await waitForNextStep();
    body.code = totp(a.totpSecret);
  }
  const res = await a.api('/account/delete', { body });
  expect(res.status, `closing the test account: ${JSON.stringify(res.data)}`).toBe(201);
}

/** A published card owned by the account. */
export async function publishedCard(a: Account, fullName: string): Promise<{ id: string; slug: string }> {
  const created = await a.api<{ id: string; slug: string }>('/cards', { body: { templateId: 'swiss-indigo', fullName, title: 'Sales Lead' } });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const published = await a.api<{ id: string; slug: string }>(`/cards/${created.data.id}`, { method: 'PATCH', body: { isPublished: true } });
  expect(published.status, JSON.stringify(published.data)).toBe(200);
  return published.data;
}

/** Signs in through the sign-in page and waits for the dashboard. */
export async function signIn(page: Page, a: Pick<Account, 'email' | 'password'>) {
  await page.goto('/login');
  await page.locator('input[autocomplete=username]').fill(a.email);
  await page.locator('input[type=password]').fill(a.password);
  // The form's own button, whatever language the page is in.
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/dashboard/);
  // The first time, the app picks the workspace and reloads: wait for that to finish.
  await page.waitForFunction(() => !!localStorage.getItem('vertex_org_id'));
  await page.waitForLoadState('networkidle');
}

/** The pages served in Arabic: the language is a cookie, as the switcher sets it. */
export async function useArabic(page: Page) {
  await page.context().addCookies([{ name: 'vertex_locale', value: 'ar', url: WEB }]);
}

// --- Time-based one-time passwords (RFC 6238), as an authenticator app makes them ---

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s.replace(/[\s=]/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = mac[mac.length - 1]! & 15;
  const n = ((mac[o]! & 127) << 24) | (mac[o + 1]! << 16) | (mac[o + 2]! << 8) | mac[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Each code is accepted once: waits for the next 30-second step. */
export async function waitForNextStep() {
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 300));
}

/**
 * The test runner, with a fresh account per test (closed afterwards) and a
 * check that no page threw an error along the way.
 */
export const test = base.extend<{ account: Account; pageErrors: string[] }>({
  account: async ({}, use) => {
    const a = await newAccount();
    await use(a);
    await closeAccount(a);
  },
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, 'errors thrown in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
