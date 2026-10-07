import { SignedTokenVerifier } from './signed-token';

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

export class GoogleIdTokenVerifier {
  private readonly tokens: SignedTokenVerifier;

  constructor(
    private readonly clientId: string,
    http: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.tokens = new SignedTokenVerifier(
      {
        keysUrl: 'https://www.googleapis.com/oauth2/v3/certs',
        issuers: new Set(['accounts.google.com', 'https://accounts.google.com']),
        provider: 'Google',
        fail: (m) => new GoogleTokenError(m),
      },
      http,
      now,
    );
  }

  async verify(token: string): Promise<GoogleIdentity> {
    const claims = await this.tokens.verify(token, [this.clientId]);
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
