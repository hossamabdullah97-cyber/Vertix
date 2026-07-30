import { signState, verifyState, type StatePayload } from './oauth-state';
import {
  resolveOAuthConfig,
  isOAuthConfigured,
  buildAuthorizationUrl,
  redirectUri,
} from './oauth-providers';

/**
 * The OAuth framework's trust-bearing pieces. The state token is the CSRF
 * defence, and config resolution decides whether a provider is even connectable
 * — both are pinned here so a regression cannot silently weaken the flow.
 */

const SECRET = 'oauth_state_secret_at_least_16_chars';
const NOW = 1_800_000_000;

function state(over: Partial<StatePayload> = {}): StatePayload {
  return { orgId: 'org_acme', userId: 'u1', provider: 'slack', nonce: 'n1', exp: NOW + 600, ...over };
}

describe('oauth state', () => {
  it('round-trips a signed state', () => {
    const token = signState(state(), SECRET);
    expect(verifyState(token, SECRET, NOW)).toMatchObject({ orgId: 'org_acme', provider: 'slack' });
  });

  it('rejects a state signed with a different secret', () => {
    const token = signState(state(), SECRET);
    expect(verifyState(token, 'other_secret_value_16chars', NOW)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signState(state(), SECRET);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify(state({ orgId: 'org_evil' })), 'utf8')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyState(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(body).toBeTruthy();
  });

  it('rejects an expired state', () => {
    const token = signState(state({ exp: NOW - 1 }), SECRET);
    expect(verifyState(token, SECRET, NOW)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyState('garbage', SECRET, NOW)).toBeNull();
    expect(verifyState('a.b.c', SECRET, NOW)).toBeNull();
  });
});

describe('oauth provider config', () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

  it('is not configured for a provider without app credentials → Coming Soon', () => {
    expect(isOAuthConfigured('slack', env({}))).toBe(false);
    expect(resolveOAuthConfig('slack', env({}))).toBeNull();
  });

  it('is not configured for a provider with no OAuth endpoints at all', () => {
    expect(resolveOAuthConfig('telegram', env({ OAUTH_TELEGRAM_CLIENT_ID: 'x', OAUTH_TELEGRAM_CLIENT_SECRET: 'y' }))).toBeNull();
  });

  it('resolves config once client id and secret are supplied', () => {
    const cfg = resolveOAuthConfig('slack', env({
      OAUTH_SLACK_CLIENT_ID: 'cid', OAUTH_SLACK_CLIENT_SECRET: 'csecret',
    }));
    expect(cfg).toMatchObject({
      provider: 'slack',
      clientId: 'cid',
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
    });
  });

  it('allows endpoint overrides for sandbox / regional / self-hosted', () => {
    const cfg = resolveOAuthConfig('slack', env({
      OAUTH_SLACK_CLIENT_ID: 'cid', OAUTH_SLACK_CLIENT_SECRET: 'csecret',
      OAUTH_SLACK_AUTH_URL: 'http://localhost:5555/authorize',
      OAUTH_SLACK_TOKEN_URL: 'http://localhost:5555/token',
    }))!;
    expect(cfg.authUrl).toBe('http://localhost:5555/authorize');
    expect(cfg.tokenUrl).toBe('http://localhost:5555/token');
  });

  it('derives a default callback redirect URI', () => {
    expect(redirectUri(env({}))).toContain('/api/integrations/oauth/callback');
    expect(redirectUri(env({ OAUTH_REDIRECT_URI: 'https://x.dev/cb' }))).toBe('https://x.dev/cb');
  });

  it('builds an authorization URL with the standard params', () => {
    const cfg = resolveOAuthConfig('google_calendar', env({
      OAUTH_GOOGLE_CALENDAR_CLIENT_ID: 'gid', OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET: 'gsecret',
      OAUTH_REDIRECT_URI: 'https://x.dev/cb',
    }))!;
    const url = new URL(buildAuthorizationUrl(cfg, 'the-state'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('gid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.dev/cb');
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.searchParams.get('scope')).toContain('calendar.events');
  });
});
