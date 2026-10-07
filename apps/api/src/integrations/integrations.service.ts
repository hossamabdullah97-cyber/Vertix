import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { INTEGRATION_REGISTRY } from './integration-registry';
import { getEndpoints, envClientCredentials, USER_SCOPED_PROVIDERS } from './oauth-providers';
import { OAuthAppsService } from './oauth-apps.service';
import { CrmSyncService } from './crm/crm-sync.service';
import { ZAPIER_LABEL } from './zapier/zapier.service';

/**
 * Merges the static provider catalog with a workspace's real, per-tenant
 * connection rows so the marketplace shows genuine status. A provider with no
 * row is simply "not connected"; nothing here fabricates a connection.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly oauthApps: OAuthAppsService,
    private readonly crmSync: CrmSyncService,
  ) {}

  async marketplace(tenant: TenantContext) {
    // orgId is auto-injected by the tenant layer.
    const connections = await this.prisma.client.integrationConnection.findMany({
      select: {
        provider: true,
        status: true,
        scope: true,
        userId: true,
        externalAccountName: true,
        lastSyncAt: true,
        lastError: true,
        updatedAt: true,
      },
    });
    // One each connects for themselves shows as connected only to them.
    // Zapier is connected by the Zaps listening (webhooks it made), not by a token.
    const zaps = await this.prisma.client.webhookEndpoint.count({ where: { deletedAt: null, enabled: true, description: { startsWith: ZAPIER_LABEL } } });
    const byProvider = new Map(
      connections.filter((c) => !USER_SCOPED_PROVIDERS.has(c.provider) || c.userId === tenant.userId).map((c) => [c.provider, c]),
    );
    // Which providers THIS org has registered its own OAuth app for.
    const orgApps = await this.oauthApps.configuredProviders(tenant.orgId);

    return INTEGRATION_REGISTRY.map((p) => {
      const conn =
        p.key === 'zapier' && zaps > 0
          ? { status: 'CONNECTED' as const, scope: 'ORG' as const, userId: null, externalAccountName: null, lastSyncAt: null, lastError: null, updatedAt: new Date() }
          : byProvider.get(p.key);
      const supportsOAuth = getEndpoints(p.key, this.config) !== null;
      // Connectable for THIS org when it registered its own app, or a platform
      // env app exists as a fallback. Availability is per-organization.
      const connectable =
        supportsOAuth &&
        (orgApps.has(p.key) || envClientCredentials(p.key, this.config) !== null);
      const status = connectable ? 'available' : p.status;
      return {
        ...p,
        status,
        // Whether this org has registered its OWN app for the provider.
        oauthAppConfigured: orgApps.has(p.key),
        supportsOAuth,
        // Whether this provider supports Vertex → CRM lead sync.
        crmSyncable: this.crmSync.isCrmProvider(p.key),
        // Live state — from the DB, or a plain disconnected default.
        connection: conn
          ? {
              status: conn.status,
              scope: conn.scope,
              account: conn.externalAccountName,
              lastSyncAt: conn.lastSyncAt,
              lastError: conn.lastError,
              updatedAt: conn.updatedAt,
            }
          : null,
      };
    });
  }
}
