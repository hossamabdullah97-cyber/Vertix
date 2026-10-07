import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { AppleIdTokenVerifier, AppleTokenError } from './apple-id-token';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'a1', alg: 'RS256', use: 'sig' };
const NOW = 1_800_000_000_000;
const NONCE = 'a-random-nonce-chosen-by-the-app';

function token(claims: Record<string, unknown>) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', kid: 'a1' });
  const body = enc(claims);
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

const good = {
  iss: 'https://appleid.apple.com',
  aud: 'dev.vertex.connect',
  sub: '001234.abcd.5678',
  email: 'x7@privaterelay.appleid.com',
  email_verified: 'true',
  is_private_email: 'true',
  nonce: createHash('sha256').update(NONCE).digest('hex'),
  iat: NOW / 1000 - 5,
  exp: NOW / 1000 + 600,
};

function verifier() {
  const http = jest.fn(async () => new Response(JSON.stringify({ keys: [jwk] })));
  return { http, v: new AppleIdTokenVerifier(['dev.vertex.connect', 'dev.vertex.connect.web'], http as never, () => NOW) };
}

describe('AppleIdTokenVerifier', () => {
  it("reads a genuine token from Apple's keys", async () => {
    const { v, http } = verifier();
    await expect(v.verify(token(good), NONCE)).resolves.toEqual({
      sub: '001234.abcd.5678',
      email: 'x7@privaterelay.appleid.com',
      emailVerified: true,
      privateEmail: true,
    });
    expect(http).toHaveBeenCalledWith('https://appleid.apple.com/auth/keys', expect.anything());
  });

  it('knows a returning person without an email', async () => {
    const { v } = verifier();
    const { email: _e, email_verified: _v, ...rest } = good;
    await expect(v.verify(token(rest), NONCE)).resolves.toMatchObject({ sub: good.sub, email: null, emailVerified: false });
  });

  it('accepts any of the apps the server lists', async () => {
    const { v } = verifier();
    await expect(v.verify(token({ ...good, aud: 'dev.vertex.connect.web' }), NONCE)).resolves.toMatchObject({ sub: good.sub });
  });

  it.each([
    ['another nonce (a replayed token)', { ...good }, 'some-other-nonce-of-the-app', 'Wrong nonce'],
    ['no nonce', { ...good, nonce: undefined }, NONCE, 'Wrong nonce'],
    ['another app', { ...good, aud: 'com.someone.else' }, NONCE, 'Issued for another app'],
    ['another issuer', { ...good, iss: 'https://accounts.google.com' }, NONCE, 'Not issued by Apple'],
    ['an expired token', { ...good, exp: NOW / 1000 - 3600 }, NONCE, 'Expired'],
  ])('refuses %s', async (_what, claims, nonce, message) => {
    const { v } = verifier();
    await expect(v.verify(token(claims), nonce)).rejects.toThrow(new AppleTokenError(message));
  });
});
