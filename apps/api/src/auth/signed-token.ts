import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

/**
 * Checks an ID token signed by an identity provider (Google, Apple): signed
 * by one of the provider's current keys, issued by it, for this app, and not
 * expired. The keys are fetched from the provider's JWKS address and kept as
 * long as it says they may be.
 */

export type Jwk = JsonWebKey & { kid: string; alg?: string };

/** Leeway for clocks that disagree a little. */
const SKEW_S = 60;

const b64url = (s: string) => Buffer.from(s, 'base64url');

export class SignedTokenVerifier {
  private keys: { byId: Map<string, Jwk>; until: number } | null = null;

  constructor(
    private readonly opts: {
      /** The provider's JWKS address. */
      keysUrl: string;
      issuers: ReadonlySet<string>;
      /** The provider's name, in errors. */
      provider: string;
      /** The error thrown for a token that is refused. */
      fail: (message: string) => Error;
    },
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async key(kid: string): Promise<Jwk | undefined> {
    if (!this.keys || this.keys.until <= this.now() || !this.keys.byId.has(kid)) {
      const res = await this.http(this.opts.keysUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw this.opts.fail(`Could not fetch ${this.opts.provider}'s keys (${res.status})`);
      const { keys } = (await res.json()) as { keys: Jwk[] };
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
      this.keys = { byId: new Map(keys.map((k) => [k.kid, k])), until: this.now() + maxAge * 1000 };
    }
    return this.keys.byId.get(kid);
  }

  /** The token's claims, once it is shown to be genuine and meant for one of these audiences. */
  async verify(token: string, audiences: readonly string[]): Promise<Record<string, unknown>> {
    const { fail, provider } = this.opts;
    const parts = token.split('.');
    if (parts.length !== 3) throw fail(`Not a ${provider} sign-in token`);
    const [h, p, sig] = parts as [string, string, string];
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(b64url(h).toString('utf8'));
      claims = JSON.parse(b64url(p).toString('utf8'));
    } catch {
      throw fail(`Not a ${provider} sign-in token`);
    }
    if (header.alg !== 'RS256' || !header.kid) throw fail('Unexpected token signature');

    const jwk = await this.key(header.kid);
    if (!jwk) throw fail('Signed with an unknown key');
    const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), b64url(sig));
    if (!ok) throw fail('Bad signature');

    const nowS = Math.floor(this.now() / 1000);
    if (!this.opts.issuers.has(String(claims.iss))) throw fail(`Not issued by ${provider}`);
    const aud = claims.aud;
    const forUs = Array.isArray(aud) ? aud.some((a) => audiences.includes(a)) : audiences.includes(String(aud));
    if (!forUs) throw fail('Issued for another app');
    if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < nowS) throw fail('Expired');
    if (typeof claims.iat === 'number' && claims.iat - SKEW_S > nowS) throw fail('Issued in the future');
    return claims;
  }
}
