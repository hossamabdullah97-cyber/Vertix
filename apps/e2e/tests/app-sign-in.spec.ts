import { createHash, randomBytes } from 'node:crypto';
import { API, call, expect, test } from './support';

/** What the phone app makes before opening the website (apps/mobile/src/lib/web-sign-in.ts). */
function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

test('the phone app signs in through the website, whatever way the website signed the person in', async ({ page, account }) => {
  const { verifier, challenge } = pkce();

  // 1. Not signed in on the website: its sign-in first, then straight back to the app's page.
  await page.goto(`/app-login?challenge=${challenge}`);
  await page.waitForURL(/\/login\?next=/);
  await page.locator('input[autocomplete=username]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/app-login\?challenge=/);
  await expect(page.getByText(`Signed in as ${account.email}`)).toBeVisible();

  // 2. Confirmed: the app gets a one-time code, at its own address only.
  await page.getByTestId('app-login-continue').click();
  const open = page.getByTestId('app-login-open');
  await expect(open).toBeVisible();
  const back = new URL((await open.getAttribute('href'))!);
  expect(`${back.protocol}//${back.host}`).toBe('vertexconnect://auth');
  const code = back.searchParams.get('code')!;

  // 3. The code is useless without the app's verifier, and good once with it.
  expect((await call('/auth/app-handoff/redeem', { body: { code, verifier: pkce().verifier } })).status).toBe(401);
  const res = await fetch(`${API}/auth/app-handoff/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'VertexConnectApp/1.0 (iPhone; iOS 19.0; Mobile)' },
    body: JSON.stringify({ code, verifier }),
  });
  expect(res.status).toBe(201);
  const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
  const me = await call<{ email: string; orgId: string }>('/auth/me', { token: tokens.accessToken });
  expect(me.data).toMatchObject({ email: account.email, orgId: account.orgId });
  expect((await call('/auth/app-handoff/redeem', { body: { code, verifier } })).status).toBe(401);

  // 4. The phone is a device of its own on the account.
  const sessions = await call<{ userAgent: string | null; current: boolean }[]>('/auth/sessions', { token: tokens.accessToken });
  expect(sessions.data.find((s) => s.current)?.userAgent).toContain('VertexConnectApp/');
  expect(sessions.data.length).toBeGreaterThanOrEqual(2);
});

test('the website page refuses to run without the app’s challenge', async ({ page }) => {
  await page.goto('/app-login?challenge=short');
  await expect(page.getByRole('heading', { name: 'Open this from the app' })).toBeVisible();
});
