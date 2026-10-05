/**
 * OAuth 2.0 endpoint configuration per provider, plus resolution of the
 * per-provider app credentials from the environment.
 *
 * The framework is provider-agnostic: the authorization/token URLs below are
 * the real, public endpoints for each provider. A provider only becomes
 * connectable once its app credentials are supplied via env
 * (`OAUTH_<KEY>_CLIENT_ID` / `OAUTH_<KEY>_CLIENT_SECRET`) — otherwise it stays
 * "Coming Soon". Endpoints can be overridden per provider
 * (`OAUTH_<KEY>_AUTH_URL` / `OAUTH_<KEY>_TOKEN_URL`) for regional, self-hosted,
 * or sandbox instances.
 */
export interface OAuthEndpoints {
  authUrl: string;
  tokenUrl: string;
  /** Default scopes requested if the connection does not specify its own. */
  scopes: string[];
}

/** Real OAuth 2.0 endpoints for the catalogued providers that support it. */
export const OAUTH_ENDPOINTS: Record<string, OAuthEndpoints> = {
  hubspot: {
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
  },
  salesforce: {
    authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token'],
  },
  zoho_crm: {
    authUrl: 'https://accounts.zoho.com/oauth/v2/auth',
    tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
    scopes: ['ZohoCRM.modules.ALL'],
  },
  pipedrive: {
    authUrl: 'https://oauth.pipedrive.com/oauth/authorize',
    tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
    scopes: ['contacts:full', 'deals:full'],
  },
  google_calendar: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  },
  outlook_calendar: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Calendars.ReadWrite', 'offline_access'],
  },
  google_drive: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  },
  mailchimp: {
    authUrl: 'https://login.mailchimp.com/oauth2/authorize',
    tokenUrl: 'https://login.mailchimp.com/oauth2/token',
    scopes: [],
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:read'],
  },
};

export interface ResolvedOAuthConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

type Env = { get(key: string): string | undefined };

/** Uppercase env prefix for a provider key, e.g. "google_calendar" → "GOOGLE_CALENDAR". */
function envKey(provider: string): string {
  return provider.toUpperCase();
}

/**
 * A provider's static OAuth endpoints (same for every organization), with env
 * URL overrides. Returns null for a provider that does not support OAuth. Client
 * credentials are NOT part of this — those are per-organization (or the env
 * platform fallback), resolved separately.
 */
export function getEndpoints(provider: string, env: Env): OAuthEndpoints | null {
  const base = OAUTH_ENDPOINTS[provider];
  if (!base) return null;
  const k = envKey(provider);
  return {
    authUrl: env.get(`OAUTH_${k}_AUTH_URL`) || base.authUrl,
    tokenUrl: env.get(`OAUTH_${k}_TOKEN_URL`) || base.tokenUrl,
    scopes: base.scopes,
  };
}

/** The platform-level (env) client credentials for a provider, or null. */
export function envClientCredentials(
  provider: string,
  env: Env,
): { clientId: string; clientSecret: string } | null {
  const k = envKey(provider);
  const clientId = env.get(`OAUTH_${k}_CLIENT_ID`);
  const clientSecret = env.get(`OAUTH_${k}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** The redirect URI the provider calls back — must match the app registration. */
export function redirectUri(env: Env): string {
  return (
    env.get('OAUTH_REDIRECT_URI') ||
    `${env.get('API_PUBLIC_URL') || 'http://localhost:4000'}/api/integrations/oauth/callback`
  );
}

/**
 * Resolves a provider's full OAuth config from static endpoints + env
 * credentials, or null when it is not configured (→ "Coming Soon").
 */
export function resolveOAuthConfig(provider: string, env: Env): ResolvedOAuthConfig | null {
  const base = OAUTH_ENDPOINTS[provider];
  if (!base) return null;
  const k = envKey(provider);
  const clientId = env.get(`OAUTH_${k}_CLIENT_ID`);
  const clientSecret = env.get(`OAUTH_${k}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null; // not configured on this deployment
  return {
    provider,
    clientId,
    clientSecret,
    authUrl: env.get(`OAUTH_${k}_AUTH_URL`) || base.authUrl,
    tokenUrl: env.get(`OAUTH_${k}_TOKEN_URL`) || base.tokenUrl,
    scopes: base.scopes,
    redirectUri: redirectUri(env),
  };
}

/** True when a provider has OAuth app credentials configured on this deployment. */
export function isOAuthConfigured(provider: string, env: Env): boolean {
  return resolveOAuthConfig(provider, env) !== null;
}

/**
 * Builds the provider's authorization URL to redirect the user to. `state` is
 * the signed CSRF/context token echoed back to the callback.
 */
export function buildAuthorizationUrl(cfg: ResolvedOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
  });
  if (cfg.scopes.length) params.set('scope', cfg.scopes.join(' '));
  return `${cfg.authUrl}?${params.toString()}`;
}

/**
 * The hosts each provider serves an account's API from. An address a token
 * response names is used only when it is one of these, so a response can
 * never point the server somewhere else.
 */
const API_HOSTS: Record<string, RegExp> = {
  salesforce: /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(my\.salesforce\.com|salesforce\.com|force\.com)$/i,
  zoho_crm: /^(www\.)?zohoapis\.(com|eu|in|com\.au|jp|com\.cn|ca|sa)$/i,
  pipedrive: /^[a-z0-9-]+\.pipedrive\.com$/i,
  mailchimp: /^[a-z]{2,4}\d{1,3}\.api\.mailchimp\.com$/i,
};

/**
 * Where an account's API lives: OAUTH_<KEY>_API_URL when set (sandboxes,
 * tests), else the address the provider named, when it is one of its hosts.
 */
export function apiBaseFor(provider: string, named: string | undefined | null, env: Env): string | null {
  const override = env.get(`OAUTH_${envKey(provider)}_API_URL`);
  if (override) return override.replace(/\/$/, '');
  const hosts = API_HOSTS[provider];
  if (!hosts || !named) return null;
  try {
    const u = new URL(named);
    return u.protocol === 'https:' && !u.username && hosts.test(u.hostname) ? `https://${u.hostname.toLowerCase()}` : null;
  } catch {
    return null;
  }
}
