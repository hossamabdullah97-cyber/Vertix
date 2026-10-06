import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * The OpenID Connect side of single sign-on: a provider's published settings,
 * the address a person is sent to, the code they come back with traded for an
 * ID token, and that token checked the way the specification asks (signed by
 * one of the provider's current keys, issued by it, for this app, for this
 * sign-in, and not expired).
 * https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
 */

export class OidcError extends Error {}

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
}

export interface OidcClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
  picture: string | null;
  /** Google Workspace: the organisation's domain. Absent for personal Google accounts. */
  hd: string | null;
  /** Microsoft: the usual sign-in name, an address. */
  preferredUsername: string | null;
}

type Jwk = JsonWebKey & { kid?: string; use?: string };

const SKEW_S = 60;
const TIMEOUT_MS = 10_000;
const b64url = (s: string) => Buffer.from(s, 'base64url');

/** The pair a sign-in sends out (the challenge) and later proves it started (the verifier). */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export const randomToken = (bytes = 16) => randomBytes(bytes).toString('base64url');

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4.some((r) => r.test(ip));
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return privateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/**
 * The provider's address, as a workspace admin typed it. In production it
 * must be https and somewhere on the internet: the server fetches from it,
 * and must not be pointed at itself or the network it runs in.
 */
export async function checkIssuerUrl(issuer: string, production: boolean): Promise<string> {
  let url: URL;
  try {
    url = new URL(issuer.trim());
  } catch {
    throw new OidcError('That is not a web address');
  }
  if (!production) return url.toString().replace(/\/$/, '');
  if (url.protocol !== 'https:') throw new OidcError('The address must start with https://');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new OidcError('That address could not be found');
  if (addresses.some(privateAddress)) throw new OidcError('That address is not on the public internet');
  return url.toString().replace(/\/$/, '');
}

export class OidcClient {
  private discovery = new Map<string, { doc: Discovery; until: number }>();
  private keys = new Map<string, { byId: Jwk[]; until: number }>();

  constructor(
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.http(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new OidcError(`Could not reach ${new URL(url).host}`);
    }
    const body = (await res.json().catch(() => null)) as T | null;
    if (!res.ok || !body) {
      const reason = (body as { error_description?: string; error?: string } | null)?.error_description ?? (body as { error?: string } | null)?.error;
      throw new OidcError(`${new URL(url).host} answered ${res.status}${reason ? `: ${reason}` : ''}`);
    }
    return body;
  }

  /** The provider's published settings, kept for an hour. */
  async discover(issuer: string): Promise<Discovery> {
    const base = issuer.replace(/\/$/, '');
    const kept = this.discovery.get(base);
    if (kept && kept.until > this.now()) return kept.doc;
    const doc = await this.getJson<Discovery>(`${base}/.well-known/openid-configuration`);
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri || !doc.issuer) {
      throw new OidcError('This provider does not publish OpenID Connect settings');
    }
    // A provider must name itself as the address it is found at (spec 4.3).
    if (doc.issuer.replace(/\/$/, '') !== base) throw new OidcError(`The provider calls itself ${doc.issuer}, not ${base}`);
    this.discovery.set(base, { doc, until: this.now() + 3600_000 });
    return doc;
  }

  authorizationUrl(
    doc: Discovery,
    p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; loginHint?: string; extra?: Record<string, string> },
  ): string {
    const url = new URL(doc.authorization_endpoint);
    const q = url.searchParams;
    q.set('response_type', 'code');
    q.set('client_id', p.clientId);
    q.set('redirect_uri', p.redirectUri);
    q.set('scope', 'openid email profile');
    q.set('state', p.state);
    q.set('nonce', p.nonce);
    q.set('code_challenge', p.challenge);
    q.set('code_challenge_method', 'S256');
    if (p.loginHint) q.set('login_hint', p.loginHint);
    for (const [k, v] of Object.entries(p.extra ?? {})) q.set(k, v);
    return url.toString();
  }

  /** Trades the code for tokens and returns the checked ID token's claims. */
  async exchange(
    doc: Discovery,
    p: { clientId: string; clientSecret: string; redirectUri: string; code: string; verifier: string; nonce: string },
  ): Promise<OidcClaims> {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirectUri, code_verifier: p.verifier });
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    const methods = doc.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
    if (methods.includes('client_secret_basic')) {
      const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
      headers.authorization = `Basic ${Buffer.from(`${enc(p.clientId)}:${enc(p.clientSecret)}`).toString('base64')}`;
    } else {
      form.set('client_id', p.clientId);
      form.set('client_secret', p.clientSecret);
    }
    const tokens = await this.getJson<{ id_token?: string }>(doc.token_endpoint, { method: 'POST', headers, body: form.toString() });
    if (!tokens.id_token) throw new OidcError('The provider sent no ID token');
    return this.verifyIdToken(doc, tokens.id_token, p.clientId, p.nonce);
  }

  private async key(doc: Discovery, kid: string | undefined, kty: string): Promise<Jwk | undefined> {
    const pick = (list: Jwk[]) => list.find((k) => (kid ? k.kid === kid : k.kty === kty) && (!k.use || k.use === 'sig'));
    const kept = this.keys.get(doc.jwks_uri);
    if (kept && kept.until > this.now()) {
      const found = pick(kept.byId);
      if (found) return found;
    }
    // Unknown key: the provider may have rotated, so fetch again.
    const { keys } = await this.getJson<{ keys: Jwk[] }>(doc.jwks_uri);
    this.keys.set(doc.jwks_uri, { byId: keys ?? [], until: this.now() + 3600_000 });
    return pick(keys ?? []);
  }

  async verifyIdToken(doc: Discovery, token: string, clientId: string, nonce: string): Promise<OidcClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new OidcError('Not an ID token');
    const [h, p, sig] = parts as [string, string, string];
    let header: { alg?: string; kid?: string };
    let c: Record<string, unknown>;
    try {
      header = JSON.parse(b64url(h).toString('utf8'));
      c = JSON.parse(b64url(p).toString('utf8'));
    } catch {
      throw new OidcError('Not an ID token');
    }
    const algs: Record<string, { kty: string; hash: string; dsa?: true }> = {
      RS256: { kty: 'RSA', hash: 'sha256' },
      RS384: { kty: 'RSA', hash: 'sha384' },
      RS512: { kty: 'RSA', hash: 'sha512' },
      ES256: { kty: 'EC', hash: 'sha256', dsa: true },
      ES384: { kty: 'EC', hash: 'sha384', dsa: true },
    };
    const alg = header.alg ? algs[header.alg] : undefined;
    if (!alg) throw new OidcError(`Unsupported token signature (${header.alg ?? 'none'})`);
    const jwk = await this.key(doc, header.kid, alg.kty);
    if (!jwk || jwk.kty !== alg.kty) throw new OidcError('Signed with an unknown key');
    const ok = verify(
      alg.hash,
      Buffer.from(`${h}.${p}`),
      alg.dsa ? { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' } : createPublicKey({ key: jwk, format: 'jwk' }),
      b64url(sig),
    );
    if (!ok) throw new OidcError('Bad signature');

    const nowS = Math.floor(this.now() / 1000);
    if (String(c.iss).replace(/\/$/, '') !== doc.issuer.replace(/\/$/, '')) throw new OidcError('Issued by another provider');
    const aud = c.aud;
    if (Array.isArray(aud) ? !aud.includes(clientId) : aud !== clientId) throw new OidcError('Issued for another app');
    if (Array.isArray(aud) && aud.length > 1 && c.azp !== clientId) throw new OidcError('Issued for another app');
    if (typeof c.exp !== 'number' || c.exp + SKEW_S < nowS) throw new OidcError('Expired');
    if (typeof c.iat === 'number' && c.iat - SKEW_S > nowS) throw new OidcError('Issued in the future');
    if (c.nonce !== nonce) throw new OidcError('Not for this sign-in');
    if (typeof c.sub !== 'string' || !c.sub) throw new OidcError('Missing account details');

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      sub: c.sub,
      email: str(c.email),
      emailVerified: c.email_verified === undefined ? null : c.email_verified === true || c.email_verified === 'true',
      name: str(c.name),
      picture: str(c.picture),
      hd: str(c.hd),
      preferredUsername: str(c.preferred_username),
    };
  }
}
