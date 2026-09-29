import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

/**
 * Checks a Google ID token (what "Sign in with Google" hands the page) the
 * way Google's documentation asks: signed by one of Google's current keys,
 * issued by Google, for this app, and not expired.
 * https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export class GoogleTokenError extends Error {}

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Leeway for clocks that disagree a little. */
const SKEW_S = 60;

type Jwk = JsonWebKey & { kid: string; alg?: string };

const b64url = (s: string) => Buffer.from(s, 'base64url');

export class GoogleIdTokenVerifier {
  private keys: { byId: Map<string, Jwk>; until: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Google's signing keys, kept as long as Google says they may be. */
  private async key(kid: string): Promise<Jwk | undefined> {
    if (!this.keys || this.keys.until <= this.now() || !this.keys.byId.has(kid)) {
      const res = await this.http(CERTS_URL, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new GoogleTokenError(`Could not fetch Google's keys (${res.status})`);
      const { keys } = (await res.json()) as { keys: Jwk[] };
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
      this.keys = { byId: new Map(keys.map((k) => [k.kid, k])), until: this.now() + maxAge * 1000 };
    }
    return this.keys.byId.get(kid);
  }

  async verify(token: string): Promise<GoogleIdentity> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new GoogleTokenError('Not a Google sign-in token');
    const [h, p, sig] = parts as [string, string, string];
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(b64url(h).toString('utf8'));
      claims = JSON.parse(b64url(p).toString('utf8'));
    } catch {
      throw new GoogleTokenError('Not a Google sign-in token');
    }
    if (header.alg !== 'RS256' || !header.kid) throw new GoogleTokenError('Unexpected token signature');

    const jwk = await this.key(header.kid);
    if (!jwk) throw new GoogleTokenError('Signed with an unknown key');
    const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), b64url(sig));
    if (!ok) throw new GoogleTokenError('Bad signature');

    const nowS = Math.floor(this.now() / 1000);
    if (!ISSUERS.has(String(claims.iss))) throw new GoogleTokenError('Not issued by Google');
    const aud = claims.aud;
    if (Array.isArray(aud) ? !aud.includes(this.clientId) : aud !== this.clientId) throw new GoogleTokenError('Issued for another app');
    if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < nowS) throw new GoogleTokenError('Expired');
    if (typeof claims.iat === 'number' && claims.iat - SKEW_S > nowS) throw new GoogleTokenError('Issued in the future');
    if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') throw new GoogleTokenError('Missing account details');

    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : null,
      picture: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }
}
