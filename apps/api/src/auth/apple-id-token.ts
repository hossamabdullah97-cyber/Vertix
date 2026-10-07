import { createHash, timingSafeEqual } from 'node:crypto';
import { SignedTokenVerifier } from './signed-token';

/**
 * Checks the identity token "Sign in with Apple" hands the app: signed by
 * Apple, for one of this server's apps (the iOS bundle id, or a Services ID
 * for the web), not expired, and carrying the nonce the app chose for this
 * sign-in (the app sends Apple its SHA-256 and the server the original), so
 * a token cannot be replayed.
 * https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/verifying_a_user
 */

export interface AppleIdentity {
  sub: string;
  /** Absent when the person signed in before and Apple no longer sends it. */
  email: string | null;
  emailVerified: boolean;
  /** An @privaterelay.appleid.com address that forwards to theirs. */
  privateEmail: boolean;
}

export class AppleTokenError extends Error {}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class AppleIdTokenVerifier {
  private readonly tokens: SignedTokenVerifier;

  constructor(
    private readonly audiences: readonly string[],
    http: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.tokens = new SignedTokenVerifier(
      {
        keysUrl: 'https://appleid.apple.com/auth/keys',
        issuers: new Set(['https://appleid.apple.com']),
        provider: 'Apple',
        fail: (m) => new AppleTokenError(m),
      },
      http,
      now,
    );
  }

  async verify(token: string, nonce: string): Promise<AppleIdentity> {
    const claims = await this.tokens.verify(token, this.audiences);
    const expected = Buffer.from(sha256(nonce));
    const got = Buffer.from(typeof claims.nonce === 'string' ? claims.nonce : '');
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) throw new AppleTokenError('Wrong nonce');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new AppleTokenError('Missing account details');
    const yes = (v: unknown) => v === true || v === 'true';
    return {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      emailVerified: yes(claims.email_verified),
      privateEmail: yes(claims.is_private_email),
    };
  }
}
