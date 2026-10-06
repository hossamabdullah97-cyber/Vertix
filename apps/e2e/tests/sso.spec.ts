import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { call, closeAccount, confirmEmail, expect, PASSWORD, signIn, test, WEB, type Account } from './support';

/**
 * A company's sign-in provider, as small as OpenID Connect allows: it signs in
 * whoever the test says is at the keyboard, and checks what a real one checks
 * (the app's secret, the redirect address, the PKCE verifier).
 */
class MockProvider {
  private server!: Server;
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codes = new Map<string, { nonce: string; challenge: string; who: { sub: string; email: string; name: string } }>();
  readonly clientId = `vertex-${randomBytes(3).toString('hex')}`;
  readonly clientSecret = randomBytes(12).toString('hex');
  issuer = '';
  /** Who signs in next. */
  who = { sub: '', email: '', name: '' };

  async start() {
    this.server = createServer((req, res) => {
      const url = new URL(req.url!, this.issuer);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/.well-known/openid-configuration') {
        return json(200, {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/keys`,
          token_endpoint_auth_methods_supported: ['client_secret_post'],
        });
      }
      if (url.pathname === '/keys') return json(200, { keys: [{ ...this.keys.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] });
      if (url.pathname === '/authorize') {
        const q = url.searchParams;
        if (q.get('client_id') !== this.clientId || q.get('redirect_uri') !== `${WEB}/sso/callback` || q.get('code_challenge_method') !== 'S256') {
          return json(400, { error: 'invalid_request' });
        }
        const code = randomBytes(12).toString('hex');
        this.codes.set(code, { nonce: q.get('nonce')!, challenge: q.get('code_challenge')!, who: { ...this.who } });
        res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state')!)}` });
        return res.end();
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          const f = new URLSearchParams(raw);
          const grant = this.codes.get(f.get('code') ?? '');
          this.codes.delete(f.get('code') ?? '');
          if (f.get('client_id') !== this.clientId || f.get('client_secret') !== this.clientSecret) return json(401, { error: 'invalid_client' });
          if (!grant || createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') !== grant.challenge) return json(400, { error: 'invalid_grant' });
          const now = Math.floor(Date.now() / 1000);
          const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
          const body = `${enc({ alg: 'RS256', kid: 'k1' })}.${enc({ iss: this.issuer, aud: this.clientId, iat: now, exp: now + 300, nonce: grant.nonce, email_verified: true, ...grant.who })}`;
          json(200, { access_token: 'x', token_type: 'Bearer', id_token: `${body}.${sign('RSA-SHA256', Buffer.from(body), this.keys.privateKey).toString('base64url')}` });
        });
        return;
      }
      json(404, { error: 'not_found' });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.issuer = `http://localhost:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    this.server.close();
  }
}

/** An account with a password at a given address, as someone who signed up before the company used single sign-on. */
async function accountAt(email: string, name: string): Promise<Account> {
  const r = await call<{ accessToken: string }>('/auth/register', { body: { email, password: PASSWORD, name, organizationName: `${name} Co` } });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  const claims = JSON.parse(Buffer.from(r.data.accessToken.split('.')[1]!, 'base64url').toString());
  const a: Account = { email, password: PASSWORD, name, token: r.data.accessToken, userId: claims.sub, orgId: claims.orgId, api: (p, o = {}) => call(p, { ...o, token: a.token, orgId: a.orgId }) };
  await a.api('/account/onboarding', { method: 'PATCH', body: { welcomed: true } });
  return a;
}

test('a company connects its provider, its people sign in through it, and it can be required', async ({ page, browser, account }) => {
  const idp = new MockProvider();
  await idp.start();
  const tag = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const domain = `sso-${tag}.test`;
  confirmEmail(account);
  // A company on a plan with room for the people who join through it.
  const db = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
  execFileSync('psql', [db, '-c', `UPDATE organizations SET plan = 'BUSINESS' WHERE id = '${account.orgId.replace(/[^a-z0-9]/gi, '')}'`]);
  // Someone at the company who already had a password.
  const omar = await accountAt(`e2e-omar-${tag}@${domain}`, 'Omar Said');
  const sara = { email: `e2e-sara-${tag}@${domain}`, token: '' };
  try {
    expect((await account.api('/orgs/members/invite', { body: { email: omar.email, role: 'EMPLOYEE' } })).status).toBe(201);
    expect((await omar.api(`/invitations/${account.orgId}/accept`, { method: 'POST' })).status).toBeLessThan(300);

    // 1. The owner proves the domain and connects the company's app.
    await signIn(page, account);
    await page.goto('/workspace?section=sso');
    await page.getByLabel('Domain').fill(domain);
    await page.getByRole('button', { name: 'Add domain' }).click();
    const row = page.getByTestId('sso-domain');
    await expect(row).toContainText('Waiting for DNS');
    await expect(row).toContainText('vertex-verification=');
    await row.getByRole('button', { name: 'Verify' }).click();
    await expect(row).toContainText('Verified');

    await page.getByRole('radiogroup', { name: 'Your company’s app' }).getByText('Other (OpenID Connect)').click();
    await expect(page.getByText(`${WEB}/sso/callback`)).toBeVisible();
    await page.getByLabel('Issuer address').fill(idp.issuer);
    await page.getByLabel('Client ID').fill(idp.clientId);
    await page.getByLabel('Client secret').fill(idp.clientSecret);
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(page.getByText('Not tested yet.')).toBeVisible();
    // Untested, it is offered to nobody.
    expect((await call('/auth/sso/start', { body: { email: sara.email } })).status).toBe(404);

    // 2. The test sign-in: through the provider and back, nobody signed in by it.
    idp.who = { sub: 'admin-at-idp', email: `it-${tag}@${domain}`, name: 'IT' };
    await page.getByRole('button', { name: 'Test sign-in' }).click();
    await expect(page.getByTestId('sso-tested')).toContainText(`it-${tag}@${domain}`);
    await page.getByRole('link', { name: 'Back to settings' }).click();
    await expect(page.getByTestId('sso-tested-at')).toBeVisible();

    // 3. Sara, new to Vertex, signs in with her company account and joins as a member.
    const ctx = await browser.newContext({ timezoneId: 'Africa/Cairo' });
    const other = await ctx.newPage();
    idp.who = { sub: 'sara-at-idp', email: sara.email, name: 'Sara Nabil' };
    await other.goto('/login');
    await other.getByRole('link', { name: 'Sign in with your company (SSO)' }).click();
    await other.getByLabel('Work email').fill(sara.email);
    await other.getByRole('button', { name: 'Continue' }).click();
    await other.waitForURL(/\/dashboard/);
    sara.token = (await other.evaluate(() => localStorage.getItem('vertex_token')))!;
    const me = await call<{ email: string; orgId: string; role: string; ssoRequired: boolean }>('/auth/me', { token: sara.token, orgId: account.orgId });
    expect(me.data).toMatchObject({ email: sara.email, orgId: account.orgId, role: 'EMPLOYEE', ssoRequired: false });
    // Her address only gets in through it: it can't be used for anyone else's provider account.
    idp.who = { sub: 'stranger', email: `someone@elsewhere-${tag}.test`, name: 'Stranger' };
    await other.goto(`/sso?email=${encodeURIComponent(sara.email)}`);
    await other.getByRole('button', { name: 'Continue' }).click();
    await expect(other.getByText('That account’s address is not on a domain this workspace has verified')).toBeVisible();
    await ctx.close();

    // 4. Required: Omar's password session no longer opens the workspace…
    await page.getByRole('switch', { name: 'Require single sign-on' }).click();
    await expect(page.getByText('Single sign-on is now required')).toBeVisible();
    omar.orgId = account.orgId;
    expect((await omar.api<{ ssoRequired: boolean }>('/auth/me')).data.ssoRequired).toBe(true);
    const refused = await omar.api<{ code: string }>('/cards');
    expect(refused).toMatchObject({ status: 403, data: { code: 'SSO_REQUIRED' } });
    // …though the owner's still does.
    expect((await account.api('/cards')).status).toBe(200);

    // …and the app sends him through the company's sign-in, after which it opens.
    const ctx2 = await browser.newContext({ timezoneId: 'Africa/Cairo' });
    const omarPage = await ctx2.newPage();
    await signIn(omarPage, omar);
    await omarPage.goto(`/dashboard?w=${account.orgId}`);
    idp.who = { sub: 'omar-at-idp', email: omar.email, name: 'Omar Said' };
    const passwordToken = await omarPage.evaluate(() => localStorage.getItem('vertex_token'));
    await omarPage.getByTestId('sso-gate').getByRole('button', { name: 'Continue with single sign-on' }).click();
    // Back on the page he was opening, with a session from the company's sign-in.
    const current = () => omarPage.evaluate(() => localStorage.getItem('vertex_token')).catch(() => passwordToken);
    await expect.poll(current, { timeout: 15_000 }).not.toBe(passwordToken);
    await omarPage.waitForURL(/\/dashboard/);
    await expect(omarPage.getByTestId('sso-gate')).toHaveCount(0);
    const omarToken = (await current())!;
    expect((await call('/cards', { token: omarToken, orgId: account.orgId })).status).toBe(200);
    await ctx2.close();
  } finally {
    idp.stop();
    // Close what the test made: Sara has no password, only her company account.
    if (sara.token) {
      const closed = await call('/account/delete', { token: sara.token, orgId: account.orgId, body: { confirmEmail: sara.email } });
      expect(closed.status, JSON.stringify(closed.data)).toBe(201);
    }
    await account.api('/orgs/sso', { method: 'PATCH', body: { enforced: false } });
    await closeAccount(omar);
  }
});
