import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { CredentialVault } from './credential-vault.service';
import { OAuthService } from './oauth.service';
import { signState } from './oauth-state';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../organizations/audit.service';

/**
 * Exercises the OAuth framework against a REAL local token server that speaks
 * the standard protocol — proving the authorization-code exchange, encrypted
 * storage, and refresh actually work over HTTP. The mock stands in for any
 * OAuth 2.0 provider (the framework is provider-agnostic); in production the
 * URLs point at HubSpot/Google/Slack instead.
 */

const JWT_SECRET = 'integration_test_secret_16chars_min';
const ENC_KEY = randomBytes(32).toString('base64');

// A minimal, standards-compliant token endpoint. Issues a token for a code and
// rotates it on refresh so we can tell the two grants apart.
function startTokenServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      lastClientId = params.get('client_id'); // capture whose app credentials were used
      const grant = params.get('grant_type');
      res.setHeader('content-type', 'application/json');
      if (grant === 'authorization_code' && params.get('code') === 'good-code') {
        res.end(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, token_type: 'bearer', scope: 'chat:write' }));
      } else if (grant === 'refresh_token' && params.get('refresh_token') === 'refresh-1') {
        res.end(JSON.stringify({ access_token: 'access-2', expires_in: 3600, token_type: 'bearer' }));
      } else {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'bad code or refresh token' }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/token` });
    });
  });
}

let lastClientId: string | null = null;

describe('OAuthService (integration against a real token endpoint)', () => {
  let server: Server;
  let tokenUrl: string;
  let store: Record<string, unknown> | null;
  let oauth: OAuthService;
  let vault: CredentialVault;
  // Configurable per-org app credentials for the stubbed OAuthAppsService.
  let orgAppCreds: { clientId: string; clientSecret: string } | null;

  beforeAll(async () => {
    ({ server, url: tokenUrl } = await startTokenServer());
  });
  afterAll(() => server.close());

  beforeEach(() => {
    store = null;
    orgAppCreds = null;
    lastClientId = null;
    const env: Record<string, string> = {
      JWT_SECRET,
      INTEGRATION_ENCRYPTION_KEY: ENC_KEY,
      OAUTH_SLACK_CLIENT_ID: 'cid',
      OAUTH_SLACK_CLIENT_SECRET: 'csecret',
      OAUTH_SLACK_TOKEN_URL: tokenUrl,
      OAUTH_REDIRECT_URI: 'http://localhost:4000/api/integrations/oauth/callback',
    };
    const config = {
      get: (k: string) => env[k],
      getOrThrow: (k: string) => env[k],
    } as unknown as ConfigService;

    vault = new CredentialVault(config);

    const prisma = {
      client: {
        integrationConnection: {
          findFirst: jest.fn(async () => (store ? { id: 'conn1', credentials: store.credentials, status: store.status, tokenExpiresAt: store.tokenExpiresAt } : null)),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { store = { id: 'conn1', ...data }; return store; }),
          update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { store = { ...store, ...data }; return store; }),
        },
      },
    } as unknown as PrismaService;

    const audit = { log: jest.fn() } as unknown as AuditService;
    // The org's own registered app credentials take precedence over env.
    const apps = {
      getCredentials: jest.fn(async () => orgAppCreds),
      hasCredentials: jest.fn(async () => orgAppCreds !== null),
    } as unknown as import('./oauth-apps.service').OAuthAppsService;
    oauth = new OAuthService(prisma, config, vault, audit, apps);
  });

  const validState = () =>
    signState({ orgId: 'org_acme', userId: 'u1', provider: 'slack', nonce: 'n', exp: Math.floor(Date.now() / 1000) + 300 }, JWT_SECRET);

  it('exchanges the code and stores the tokens encrypted (never in plaintext)', async () => {
    const out = await oauth.handleCallback('good-code', validState());
    expect(out).toEqual({ provider: 'slack', orgId: 'org_acme' });

    // What landed in the DB column is ciphertext, not the raw token.
    const stored = String(store!.credentials);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('access-1');
    expect(stored).not.toContain('refresh-1');
    expect(store!.status).toBe('CONNECTED');
    expect(store!.tokenExpiresAt).toBeInstanceOf(Date);

    // And it decrypts back to the real token under the right tenant context.
    const creds = vault.decryptJson<{ accessToken: string }>(stored, 'oauth:org_acme:slack');
    expect(creds.accessToken).toBe('access-1');
  });

  it("uses the ENV platform app when the org has not registered its own", async () => {
    orgAppCreds = null;
    await oauth.handleCallback('good-code', validState());
    expect(lastClientId).toBe('cid'); // the env client id
  });

  it("uses the ORGANIZATION's own app credentials when registered (per-org isolation)", async () => {
    orgAppCreds = { clientId: 'acme-own-cid', clientSecret: 'acme-own-secret' };
    await oauth.handleCallback('good-code', validState());
    // The token exchange used Acme's own client id, not the platform env one.
    expect(lastClientId).toBe('acme-own-cid');
  });

  it('rejects a tampered or expired state before hitting the provider', async () => {
    await expect(oauth.handleCallback('good-code', 'forged.state')).rejects.toThrow(/state/i);
  });

  it('surfaces a provider token error as a failed exchange', async () => {
    await expect(oauth.handleCallback('bad-code', validState())).rejects.toThrow(/exchange failed/i);
  });

  it('returns the stored token while it is still valid (no needless refresh)', async () => {
    await oauth.handleCallback('good-code', validState());
    const token = await oauth.getAccessToken('org_acme', 'slack');
    expect(token).toBe('access-1');
  });

  it('auto-refreshes an expired token against the real endpoint', async () => {
    await oauth.handleCallback('good-code', validState());
    // Force the stored token to look expired.
    store!.tokenExpiresAt = new Date(Date.now() - 1000);
    const token = await oauth.getAccessToken('org_acme', 'slack');
    expect(token).toBe('access-2'); // the refreshed token from the endpoint
    // The rotated credentials are re-encrypted and CONNECTED.
    expect(store!.status).toBe('CONNECTED');
    const creds = vault.decryptJson<{ accessToken: string; refreshToken: string }>(String(store!.credentials), 'oauth:org_acme:slack');
    expect(creds.accessToken).toBe('access-2');
    expect(creds.refreshToken).toBe('refresh-1'); // kept, since refresh didn't return a new one
  });
});
