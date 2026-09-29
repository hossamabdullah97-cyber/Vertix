import { generateKeyPairSync, sign } from 'node:crypto';
import { GoogleIdTokenVerifier, GoogleTokenError } from './google-id-token';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const NOW = 1_800_000_000_000;

function token(claims: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey; alg?: string } = {}) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const body = enc(claims);
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const good = {
  iss: 'https://accounts.google.com',
  aud: 'client-1',
  sub: '1234567890',
  email: 'mona@example.com',
  email_verified: true,
  name: 'Mona Adel',
  picture: 'https://lh3.googleusercontent.com/a/x',
  iat: NOW / 1000 - 10,
  exp: NOW / 1000 + 3600,
};

function setup() {
  const http = jest.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=600' } }));
  return { http, v: new GoogleIdTokenVerifier('client-1', http as never, () => NOW) };
}

describe('GoogleIdTokenVerifier', () => {
  it('reads a genuine token', async () => {
    const { v } = setup();
    await expect(v.verify(token(good))).resolves.toEqual({
      sub: '1234567890',
      email: 'mona@example.com',
      emailVerified: true,
      name: 'Mona Adel',
      picture: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  it('keeps Google’s keys as long as they say', async () => {
    const { v, http } = setup();
    await v.verify(token(good));
    await v.verify(token(good));
    expect(http).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['another key', () => token(good, { key: other.privateKey })],
    ['an unknown key id', () => token(good, { kid: 'k9' })],
    ['another algorithm', () => token(good, { alg: 'HS256' })],
    ['another app', () => token({ ...good, aud: 'client-2' })],
    ['another issuer', () => token({ ...good, iss: 'https://evil.example' })],
    ['an expired token', () => token({ ...good, exp: NOW / 1000 - 120 })],
    ['a token from the future', () => token({ ...good, iat: NOW / 1000 + 600 })],
    ['a token without an email', () => token({ ...good, email: undefined })],
    ['something that is not a token', () => 'abc.def'],
  ])('refuses %s', async (_, make) => {
    await expect(setup().v.verify(make())).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('refuses a token whose claims were changed after signing', async () => {
    const [h, , s] = token(good).split('.');
    const forged = Buffer.from(JSON.stringify({ ...good, email: 'boss@example.com' })).toString('base64url');
    await expect(setup().v.verify(`${h}.${forged}.${s}`)).rejects.toBeInstanceOf(GoogleTokenError);
  });
});
