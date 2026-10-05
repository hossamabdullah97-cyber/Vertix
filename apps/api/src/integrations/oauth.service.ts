import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialVault } from './credential-vault.service';
import { AuditService } from '../organizations/audit.service';
import { OAuthAppsService } from './oauth-apps.service';
import {
  getEndpoints,
  envClientCredentials,
  redirectUri,
  buildAuthorizationUrl,
  apiBaseFor,
  type ResolvedOAuthConfig,
} from './oauth-providers';
import { signState, verifyState } from './oauth-state';

const STATE_TTL_SECONDS = 600; // 10 minutes to complete consent
const REFRESH_SKEW_MS = 60_000; // refresh a minute before actual expiry

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  /** Salesforce: the org's own API host. */
  instance_url?: string;
  /** Zoho, Pipedrive: the account's API host (region or company domain). */
  api_domain?: string;
}

/** The encrypted credential blob stored on IntegrationConnection.credentials. */
interface StoredCredentials {
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  tokenType: string | null;
  /** Where this account's API lives, when the provider has one per account. */
  apiBase?: string | null;
}

/**
 * The generic OAuth 2.0 authorization-code framework. It is provider-agnostic:
 * every provider is driven by config (endpoints + env app credentials), tokens
 * are encrypted at rest and never leave the server, and refresh happens
 * automatically. A provider with no configured credentials is simply not
 * connectable ("Coming Soon") — nothing is faked.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vault: CredentialVault,
    private readonly audit: AuditService,
    private readonly apps: OAuthAppsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private stateSecret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  private aad(orgId: string, provider: string): string {
    return `oauth:${orgId}:${provider}`;
  }

  /** Whether an organization can connect a provider (its own app, or the env fallback). */
  async isConfigured(orgId: string, provider: string): Promise<boolean> {
    if (!getEndpoints(provider, this.config)) return false;
    if (await this.apps.hasCredentials(orgId, provider)) return true;
    return envClientCredentials(provider, this.config) !== null;
  }

  /**
   * Resolves a provider's full OAuth config FOR THIS ORG. The org's own
   * registered app credentials take precedence; the env platform app is only a
   * fallback. Returns config or throws if the org has no way to connect.
   */
  private async requireConfig(orgId: string, provider: string): Promise<ResolvedOAuthConfig> {
    if (!this.vault.enabled) {
      throw new ServiceUnavailableException('Credential storage is not configured on this server.');
    }
    const endpoints = getEndpoints(provider, this.config);
    if (!endpoints) {
      throw new BadRequestException(`${provider} does not support OAuth.`);
    }
    // Per-org app first, platform env second.
    const creds =
      (await this.apps.getCredentials(orgId, provider)) ??
      envClientCredentials(provider, this.config);
    if (!creds) {
      throw new BadRequestException(
        `${provider} is not connected yet — this organization has not registered its OAuth app credentials.`,
      );
    }
    return {
      provider,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      authUrl: endpoints.authUrl,
      tokenUrl: endpoints.tokenUrl,
      scopes: endpoints.scopes,
      redirectUri: redirectUri(this.config),
    };
  }

  // ---------------------------------------------------------------- authorize

  /** Builds the provider consent URL to redirect the user to. */
  async getAuthorizationUrl(tenant: TenantContext, provider: string): Promise<{ url: string }> {
    const cfg = await this.requireConfig(tenant.orgId, provider);
    const state = signState(
      {
        orgId: tenant.orgId,
        userId: tenant.userId,
        provider,
        nonce: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
      },
      this.stateSecret(),
    );
    return { url: buildAuthorizationUrl(cfg, state) };
  }

  // ----------------------------------------------------------------- callback

  /**
   * Handles the provider redirect: verifies state, exchanges the code for
   * tokens, and stores them encrypted. Returns the connected provider key.
   * Throws on any invalid/expired state or a failed exchange.
   */
  async handleCallback(code: string, stateToken: string): Promise<{ provider: string; orgId: string }> {
    const state = verifyState(stateToken, this.stateSecret());
    if (!state) throw new BadRequestException('Invalid or expired OAuth state.');

    const cfg = await this.requireConfig(state.orgId, state.provider);
    const tokens = await this.exchangeCode(cfg, code);
    const account = await this.accountOf(state.provider, tokens);
    await this.store(state.orgId, state.userId, state.provider, tokens, account);

    await this.audit.log(
      { orgId: state.orgId, userId: state.userId, role: 'OWNER' },
      'integration.connected',
      { targetType: 'integration', targetId: state.provider },
    );
    return { provider: state.provider, orgId: state.orgId };
  }

  private async exchangeCode(cfg: ResolvedOAuthConfig, code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    });
    return this.postToken(cfg.tokenUrl, body);
  }

  private async postToken(url: string, body: URLSearchParams): Promise<TokenResponse> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
    });
    const text = await res.text();
    let json: TokenResponse & { error?: string; error_description?: string };
    try {
      json = JSON.parse(text);
    } catch {
      throw new BadRequestException(`Token endpoint returned a non-JSON response (HTTP ${res.status}).`);
    }
    if (!res.ok || json.error || !json.access_token) {
      throw new BadRequestException(
        `Token exchange failed: ${json.error_description || json.error || `HTTP ${res.status}`}`,
      );
    }
    return json;
  }

  /**
   * Where the account's API lives and what it is called. Salesforce, Zoho and
   * Pipedrive say where in the token response; Mailchimp says so on a
   * metadata endpoint. An address not on the provider's own hosts is dropped.
   */
  private async accountOf(provider: string, tokens: TokenResponse): Promise<{ apiBase: string | null; name: string | null }> {
    if (provider === 'mailchimp') {
      try {
        const url = this.config.get<string>('OAUTH_MAILCHIMP_METADATA_URL') || 'https://login.mailchimp.com/oauth2/metadata';
        const res = await fetch(url, { headers: { authorization: `OAuth ${tokens.access_token}`, accept: 'application/json' } });
        const meta = (await res.json().catch(() => ({}))) as { api_endpoint?: string; accountname?: string; login?: { login_name?: string } };
        return { apiBase: apiBaseFor(provider, meta.api_endpoint, this.config), name: meta.accountname || meta.login?.login_name || null };
      } catch {
        return { apiBase: null, name: null };
      }
    }
    return { apiBase: apiBaseFor(provider, tokens.instance_url ?? tokens.api_domain, this.config), name: null };
  }

  private async store(
    orgId: string,
    userId: string,
    provider: string,
    tokens: TokenResponse,
    account: { apiBase: string | null; name: string | null } = { apiBase: null, name: null },
  ): Promise<void> {
    const creds: StoredCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      scope: tokens.scope ?? null,
      tokenType: tokens.token_type ?? null,
      apiBase: account.apiBase,
    };
    const encrypted = this.vault.encryptJson(creds, this.aad(orgId, provider));
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Upsert the connection for this org+provider. Runs with no tenant context
    // (public callback), so orgId is set explicitly.
    const existing = await this.db.integrationConnection.findFirst({
      where: { orgId, provider, userId: null },
      select: { id: true },
    });
    const data = {
      status: 'CONNECTED' as const,
      credentials: encrypted,
      tokenExpiresAt,
      lastError: null,
      ...(account.name ? { externalAccountName: account.name.slice(0, 120) } : {}),
    };
    if (existing) {
      await this.db.integrationConnection.update({ where: { id: existing.id }, data });
    } else {
      await this.db.integrationConnection.create({
        data: { orgId, provider, scope: 'ORG', userId: null, ...data },
      });
    }
  }

  // ------------------------------------------------------------------ refresh

  /**
   * Returns a valid access token for a connection, refreshing it first if it is
   * expired or about to expire. Throws (and marks the connection
   * REQUIRES_REAUTH) if refresh fails. This is what downstream sync code calls.
   */
  async getAccessToken(orgId: string, provider: string): Promise<string> {
    return (await this.getAuth(orgId, provider)).token;
  }

  /**
   * A valid token and where the account's API lives. `force` refreshes even
   * when the token has no known expiry: Salesforce sessions end without
   * saying when, so a 401 is the first sign.
   */
  async getAuth(orgId: string, provider: string, force = false): Promise<{ token: string; apiBase: string | null }> {
    const conn = await this.db.integrationConnection.findFirst({
      where: { orgId, provider, deletedAt: null },
    });
    if (!conn || !conn.credentials || conn.status === 'DISCONNECTED') {
      throw new BadRequestException(`${provider} is not connected.`);
    }
    const creds = this.vault.decryptJson<StoredCredentials>(conn.credentials, this.aad(orgId, provider));
    const apiBase = apiBaseFor(provider, creds.apiBase ?? undefined, this.config);

    const expiring =
      force || (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() - REFRESH_SKEW_MS <= Date.now());
    if (!expiring) return { token: creds.accessToken, apiBase };

    if (!creds.refreshToken) {
      await this.markReauth(conn.id, 'Access token expired and no refresh token is available.');
      throw new BadRequestException(`${provider} needs to be reconnected.`);
    }
    return this.refresh(orgId, provider, conn.id, creds.refreshToken, creds.apiBase ?? null);
  }

  private async refresh(
    orgId: string,
    provider: string,
    connId: string,
    refreshToken: string,
    apiBase: string | null,
  ): Promise<{ token: string; apiBase: string | null }> {
    const cfg = await this.requireConfig(orgId, provider);
    let tokens: TokenResponse;
    try {
      tokens = await this.postToken(
        cfg.tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }),
      );
    } catch (err) {
      await this.markReauth(connId, (err as Error).message);
      throw new BadRequestException(`${provider} needs to be reconnected.`);
    }

    // Some providers omit a new refresh token on refresh — keep the old one,
    // and the API host the account was connected with unless they name a new one.
    const creds: StoredCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? refreshToken,
      scope: tokens.scope ?? null,
      tokenType: tokens.token_type ?? null,
      apiBase: apiBaseFor(provider, tokens.instance_url ?? tokens.api_domain, this.config) ?? apiBase,
    };
    await this.db.integrationConnection.update({
      where: { id: connId },
      data: {
        status: 'CONNECTED',
        credentials: this.vault.encryptJson(creds, this.aad(orgId, provider)),
        tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        lastError: null,
      },
    });
    this.logger.log(`Refreshed ${provider} token for org ${orgId}`);
    return { token: tokens.access_token, apiBase: apiBaseFor(provider, creds.apiBase ?? undefined, this.config) };
  }

  private async markReauth(connId: string, error: string): Promise<void> {
    await this.db.integrationConnection.update({
      where: { id: connId },
      data: { status: 'REQUIRES_REAUTH', lastError: error.slice(0, 500) },
    });
  }

  // --------------------------------------------------------------- disconnect

  /** Clears stored tokens and marks the connection disconnected. */
  async disconnect(tenant: TenantContext, provider: string): Promise<{ ok: true }> {
    const conn = await this.db.integrationConnection.findFirst({ where: { provider } }); // orgId injected
    if (!conn) throw new BadRequestException(`${provider} is not connected.`);
    await this.db.integrationConnection.update({
      where: { id: conn.id },
      data: { status: 'DISCONNECTED', credentials: null, tokenExpiresAt: null },
    });
    await this.audit.log(tenant, 'integration.disconnected', {
      targetType: 'integration', targetId: provider,
    });
    return { ok: true };
  }
}
