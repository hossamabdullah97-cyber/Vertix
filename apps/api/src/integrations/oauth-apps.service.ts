import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialVault } from './credential-vault.service';
import { AuditService } from '../organizations/audit.service';
import { OAUTH_ENDPOINTS } from './oauth-providers';

/**
 * Each organization's OWN OAuth app credentials (client id + secret) per
 * provider — the "bring your own app" model. Every org registers its own app so
 * it connects the provider independently; one org's credentials are never
 * visible to, or usable by, another. The client secret is encrypted at rest and
 * never returned to the client.
 */
@Injectable()
export class OAuthAppsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CredentialVault,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private aad(orgId: string, provider: string): string {
    return `oauthapp:${orgId}:${provider}`;
  }

  private assertOAuthProvider(provider: string): void {
    if (!OAUTH_ENDPOINTS[provider]) {
      throw new BadRequestException(`${provider} does not support OAuth.`);
    }
  }

  /**
   * Resolves the client credentials this org registered for a provider, or null
   * if it has none. Called with an explicit orgId (the OAuth callback runs
   * without tenant context), so it filters by orgId directly.
   */
  async getCredentials(
    orgId: string,
    provider: string,
  ): Promise<{ clientId: string; clientSecret: string } | null> {
    const app = await this.db.integrationOAuthApp.findFirst({
      where: { orgId, provider, deletedAt: null },
      select: { clientId: true, clientSecret: true },
    });
    if (!app) return null;
    return {
      clientId: app.clientId,
      clientSecret: this.vault.decrypt(app.clientSecret, this.aad(orgId, provider)),
    };
  }

  /** True when this org has registered its own app for the provider. */
  async hasCredentials(orgId: string, provider: string): Promise<boolean> {
    const n = await this.db.integrationOAuthApp.count({
      where: { orgId, provider, deletedAt: null },
    });
    return n > 0;
  }

  /** The set of providers this org has configured (for the marketplace). */
  async configuredProviders(orgId: string): Promise<Set<string>> {
    const rows = await this.db.integrationOAuthApp.findMany({
      where: { orgId, deletedAt: null },
      select: { provider: true },
    });
    return new Set(rows.map((r) => r.provider));
  }

  /** Saves (or updates) this org's app credentials for a provider. */
  async save(
    tenant: TenantContext,
    provider: string,
    input: { clientId: string; clientSecret: string },
  ) {
    this.assertOAuthProvider(provider);
    if (!this.vault.enabled) {
      throw new BadRequestException('Credential storage is not configured on this server.');
    }
    if (!input.clientId?.trim() || !input.clientSecret?.trim()) {
      throw new BadRequestException('Both client ID and client secret are required.');
    }
    const encrypted = this.vault.encrypt(input.clientSecret, this.aad(tenant.orgId, provider));

    const existing = await this.db.integrationOAuthApp.findFirst({
      where: { orgId: tenant.orgId, provider }, // orgId also auto-injected
      select: { id: true },
    });
    if (existing) {
      await this.db.integrationOAuthApp.update({
        where: { id: existing.id },
        data: { clientId: input.clientId, clientSecret: encrypted, deletedAt: null },
      });
    } else {
      await this.db.integrationOAuthApp.create({
        data: {
          orgId: tenant.orgId,
          provider,
          clientId: input.clientId,
          clientSecret: encrypted,
          createdBy: tenant.userId,
        },
      });
    }
    await this.audit.log(tenant, 'integration.oauth_app_configured', {
      targetType: 'integration', targetId: provider,
    });
    return this.present(tenant.orgId, provider);
  }

  /** Removes this org's app credentials for a provider. */
  async remove(tenant: TenantContext, provider: string) {
    const app = await this.db.integrationOAuthApp.findFirst({ where: { provider } });
    if (!app) throw new NotFoundException('No OAuth app configured for this provider.');
    await this.db.integrationOAuthApp.update({
      where: { id: app.id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log(tenant, 'integration.oauth_app_removed', {
      targetType: 'integration', targetId: provider,
    });
    return { ok: true as const };
  }

  /** Non-secret view: whether an app is configured and its client id. */
  async present(orgId: string, provider: string) {
    const app = await this.db.integrationOAuthApp.findFirst({
      where: { orgId, provider, deletedAt: null },
      select: { clientId: true, updatedAt: true },
    });
    return {
      provider,
      configured: !!app,
      clientId: app?.clientId ?? null, // client id is not secret
      updatedAt: app?.updatedAt ?? null,
    };
  }
}
