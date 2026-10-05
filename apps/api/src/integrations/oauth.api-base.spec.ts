import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { CredentialVault } from './credential-vault.service';
import { OAuthService } from './oauth.service';
import { signState, verifyState } from './oauth-state';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../organizations/audit.service';

/**
 * Where a connected account's API lives, as the OAuth flow learns it:
 * Salesforce names its instance in the token response, Mailchimp on a
 * metadata endpoint. Against a real local server, like the other OAuth tests.
 */

const JWT_SECRET = 'integration_test_secret_16chars_min';
const ENC_KEY = randomBytes(32).toString('base64');

let instanceUrl = 'https://nileco.my.salesforce.com';
function startServer(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/metadata') {
        return res.end(JSON.stringify(req.headers.authorization === 'OAuth mc-access' ? { dc: 'us21', api_endpoint: 'https://us21.api.mailchimp.com', accountname: 'Nile Co' } : {}));
      }
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'authorization_code') {
        // Salesforce gives no expires_in; Mailchimp tokens do not expire.
        return res.end(JSON.stringify({ access_token: p.get('code') === 'mc-code' ? 'mc-access' : 'sf-access-1', refresh_token: 'sf-refresh', instance_url: instanceUrl, token_type: 'Bearer' }));
      }
      if (p.get('grant_type') === 'refresh_token') return res.end(JSON.stringify({ access_token: 'sf-access-2', instance_url: instanceUrl, token_type: 'Bearer' }));
      res.statusCode = 400;
      res.end('{}');
    });
  });
  return new Promise((resolve) =>
    server.listen(0, () => {
      const addr = server.address();
      resolve({ server, base: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` });
    }),
  );
}

describe('OAuth: where the account’s API lives', () => {
  let server: Server;
  let base: string;
  let store: Record<string, unknown> | null;
  let oauth: OAuthService;
  let vault: CredentialVault;

  beforeAll(async () => ({ server, base } = await startServer()));
  afterAll(() => server.close());

  beforeEach(() => {
    store = null;
    instanceUrl = 'https://nileco.my.salesforce.com';
    const env: Record<string, string> = {
      JWT_SECRET,
      INTEGRATION_ENCRYPTION_KEY: ENC_KEY,
      OAUTH_SALESFORCE_CLIENT_ID: 'cid',
      OAUTH_SALESFORCE_CLIENT_SECRET: 'cs',
      OAUTH_SALESFORCE_TOKEN_URL: `${base}/token`,
      OAUTH_MAILCHIMP_CLIENT_ID: 'cid',
      OAUTH_MAILCHIMP_CLIENT_SECRET: 'cs',
      OAUTH_MAILCHIMP_TOKEN_URL: `${base}/token`,
      OAUTH_MAILCHIMP_METADATA_URL: `${base}/metadata`,
      OAUTH_DYNAMICS_CLIENT_ID: 'azure-app',
      OAUTH_DYNAMICS_CLIENT_SECRET: 'cs',
      OAUTH_DYNAMICS_TOKEN_URL: `${base}/token`,
    };
    const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] } as unknown as ConfigService;
    vault = new CredentialVault(config);
    const prisma = {
      client: {
        integrationConnection: {
          findFirst: jest.fn(async () => (store ? { id: 'conn1', ...store } : null)),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (store = { ...data })),
          update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (store = { ...store, ...data })),
        },
      },
    } as unknown as PrismaService;
    const apps = { getCredentials: jest.fn(async () => null), hasCredentials: jest.fn(async () => false) } as never;
    oauth = new OAuthService(prisma, config, vault, { log: jest.fn() } as unknown as AuditService, apps);
  });

  const state = (provider: string) => signState({ orgId: 'org1', userId: 'u1', provider, nonce: 'n', exp: Math.floor(Date.now() / 1000) + 300 }, JWT_SECRET);

  it('keeps the Salesforce instance from the token response, encrypted with the tokens', async () => {
    await oauth.handleCallback('sf-code', state('salesforce'));
    expect(String(store!.credentials)).not.toContain('my.salesforce.com');
    await expect(oauth.getAuth('org1', 'salesforce')).resolves.toEqual({ token: 'sf-access-1', apiBase: 'https://nileco.my.salesforce.com' });
  });

  it('refreshes on demand, though Salesforce never said when the token ends', async () => {
    await oauth.handleCallback('sf-code', state('salesforce'));
    await expect(oauth.getAuth('org1', 'salesforce', true)).resolves.toEqual({ token: 'sf-access-2', apiBase: 'https://nileco.my.salesforce.com' });
  });

  it('drops an instance that is not one of Salesforce’s hosts', async () => {
    instanceUrl = 'https://attacker.example';
    await oauth.handleCallback('sf-code', state('salesforce'));
    await expect(oauth.getAuth('org1', 'salesforce')).resolves.toEqual({ token: 'sf-access-1', apiBase: null });
  });

  it('asks Mailchimp for the account’s data centre and name', async () => {
    await oauth.handleCallback('mc-code', state('mailchimp'));
    expect(store!.externalAccountName).toBe('Nile Co');
    await expect(oauth.getAuth('org1', 'mailchimp')).resolves.toEqual({ token: 'mc-access', apiBase: 'https://us21.api.mailchimp.com' });
  });

  it('asks Dynamics for access to the environment entered, carried signed to the callback', async () => {
    const tenant = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as never;
    await expect(oauth.getAuthorizationUrl(tenant, 'dynamics', { environment: 'https://evil.example' })).rejects.toThrow(/Dynamics 365 address/);
    await expect(oauth.getAuthorizationUrl(tenant, 'dynamics')).rejects.toThrow(/Dynamics 365 address/);

    const { url } = await oauth.getAuthorizationUrl(tenant, 'dynamics', { environment: 'https://NileCo.crm4.dynamics.com/main.aspx?appid=1' });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
    expect(u.searchParams.get('scope')).toBe('https://nileco.crm4.dynamics.com/user_impersonation offline_access');
    const state = verifyState(u.searchParams.get('state')!, JWT_SECRET);
    expect(state).toMatchObject({ provider: 'dynamics', site: 'https://nileco.crm4.dynamics.com' });

    await oauth.handleCallback('dyn-code', u.searchParams.get('state')!);
    expect(store!.externalAccountName).toBe('nileco');
    await expect(oauth.getAuth('org1', 'dynamics')).resolves.toEqual({ token: 'sf-access-1', apiBase: 'https://nileco.crm4.dynamics.com' });
  });
});
