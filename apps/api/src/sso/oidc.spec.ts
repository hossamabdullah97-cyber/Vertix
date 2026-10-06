import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { OidcClient, OidcError, checkIssuerUrl, pkce, type Discovery } from './oidc';

const ISSUER = 'https://idp.example.com';
const doc: Discovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/keys`,
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };
const NOW = 1_800_000_000_000;

function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }, key = privateKey) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc(header)}.${enc(claims)}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
}

const good = {
  iss: ISSUER,
  aud: 'client-1',
  sub: 'u-42',
  email: 'mona@acme.com',
  email_verified: true,
  nonce: 'n-1',
  iat: NOW / 1000,
  exp: NOW / 1000 + 300,
};

function client(extra: Record<string, unknown> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const http = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = url.endsWith('/keys')
      ? { keys: [jwk] }
      : url.endsWith('/.well-known/openid-configuration')
        ? doc
        : url.endsWith('/token')
          ? { id_token: token({ ...good, ...extra }) }
          : null;
    return new Response(JSON.stringify(body), { status: body ? 200 : 404 });
  });
  return { oidc: new OidcClient(http as unknown as typeof fetch, () => NOW), calls };
}

describe('OidcClient', () => {
  it('accepts a token the provider signed for this app and this sign-in', async () => {
    const { oidc } = client();
    await expect(oidc.verifyIdToken(doc, token(good), 'client-1', 'n-1')).resolves.toMatchObject({ sub: 'u-42', email: 'mona@acme.com', emailVerified: true });
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example.com' }, 'Issued by another provider'],
    ['another app', { aud: 'client-2' }, 'Issued for another app'],
    ['another sign-in', { nonce: 'n-2' }, 'Not for this sign-in'],
    ['an expired token', { exp: NOW / 1000 - 120 }, 'Expired'],
    ['no subject', { sub: '' }, 'Missing account details'],
  ])('refuses %s', async (_, patch, message) => {
    const { oidc } = client();
    await expect(oidc.verifyIdToken(doc, token({ ...good, ...patch }), 'client-1', 'n-1')).rejects.toThrow(message);
  });

  it('refuses a token signed by anyone else, or not signed at all', async () => {
    const { oidc } = client();
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(oidc.verifyIdToken(doc, token(good, undefined, other), 'client-1', 'n-1')).rejects.toThrow('Bad signature');
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify(good)).toString('base64url')}.`;
    await expect(oidc.verifyIdToken(doc, unsigned, 'client-1', 'n-1')).rejects.toThrow(OidcError);
  });

  it('trades the code with the verifier and the app secret', async () => {
    const { oidc, calls } = client();
    const claims = await oidc.exchange(doc, { clientId: 'client-1', clientSecret: 's3cret', redirectUri: 'https://app/sso/callback', code: 'c-1', verifier: 'v-1', nonce: 'n-1' });
    expect(claims.sub).toBe('u-42');
    const trade = calls.find((c) => c.url.endsWith('/token'))!;
    expect(String(trade.init?.body)).toContain('code_verifier=v-1');
    expect((trade.init?.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('client-1:s3cret').toString('base64')}`);
  });

  it('refuses a provider that names itself as some other address', async () => {
    const http = jest.fn(async () => new Response(JSON.stringify({ ...doc, issuer: 'https://elsewhere.example.com' })));
    await expect(new OidcClient(http as unknown as typeof fetch).discover(ISSUER)).rejects.toThrow('calls itself');
  });

  it('builds the sign-in address with PKCE', () => {
    const { oidc } = client();
    const { verifier, challenge } = pkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    const url = new URL(oidc.authorizationUrl(doc, { clientId: 'client-1', redirectUri: 'https://app/sso/callback', state: 's', nonce: 'n', challenge, loginHint: 'mona@acme.com' }));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ response_type: 'code', scope: 'openid email profile', code_challenge_method: 'S256', code_challenge: challenge, login_hint: 'mona@acme.com' });
  });
});

describe('checkIssuerUrl', () => {
  it('in production, takes only https addresses on the public internet', async () => {
    await expect(checkIssuerUrl('http://idp.example.com', true)).rejects.toThrow('https://');
    await expect(checkIssuerUrl('https://127.0.0.1', true)).rejects.toThrow('public internet');
    await expect(checkIssuerUrl('https://10.1.2.3/realms/x', true)).rejects.toThrow('public internet');
    await expect(checkIssuerUrl('https://[::1]', true)).rejects.toThrow('public internet');
    await expect(checkIssuerUrl('not a url', true)).rejects.toThrow('web address');
  });

  it('elsewhere, lets a local provider be used for development and tests', async () => {
    await expect(checkIssuerUrl('http://localhost:4100/', false)).resolves.toBe('http://localhost:4100');
  });
});
