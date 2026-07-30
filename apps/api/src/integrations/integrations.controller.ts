import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import {
  INTEGRATION_REGISTRY,
  CATEGORY_LABELS,
} from './integration-registry';
import { z } from 'zod';
import { IntegrationsService } from './integrations.service';
import { IntegrationAnalyticsService } from './integration-analytics.service';
import { OAuthService } from './oauth.service';
import { OAuthAppsService } from './oauth-apps.service';
import { CrmSyncService } from './crm/crm-sync.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireScopes } from '../access/scopes.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

const oauthAppSchema = z.object({
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().min(1).max(2000),
});

const syncConfigSchema = z.object({
  syncEnabled: z.boolean().optional(),
  fieldMapping: z.record(z.string()).optional(),
});

/**
 * The integration marketplace catalog and this workspace's live connection
 * state. The catalog is static config; connection status is always read from
 * the database per tenant — never hardcoded.
 */
@UseGuards(RequireTenantGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly analyticsService: IntegrationAnalyticsService,
    private readonly oauth: OAuthService,
    private readonly oauthApps: OAuthAppsService,
    private readonly crmSync: CrmSyncService,
    private readonly config: ConfigService,
  ) {}

  /** The provider catalog plus category labels for the marketplace UI. */
  @Get('providers')
  providers() {
    return { categories: CATEGORY_LABELS, providers: INTEGRATION_REGISTRY };
  }

  /** The catalog merged with this workspace's real connection state. */
  @Get()
  async marketplace(@Tenant() tenant: TenantContext) {
    return this.integrations.marketplace(tenant);
  }

  /** Workspace-wide integration throughput & success rates (real, from deliveries). */
  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('analytics')
  analytics(@Tenant() tenant: TenantContext) {
    return this.analyticsService.overview(tenant);
  }

  /** Per-endpoint health status. */
  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('health')
  health(@Tenant() tenant: TenantContext) {
    return this.analyticsService.endpointHealth(tenant);
  }

  // ---- Per-organization OAuth app credentials (BYO app) ----

  /** This org's app config for a provider (client id only — never the secret). */
  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN')
  @Get(':provider/oauth-app')
  getOAuthApp(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.oauthApps.present(tenant.orgId, provider);
  }

  /** Registers or updates this org's OWN OAuth app credentials for a provider. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Put(':provider/oauth-app')
  saveOAuthApp(
    @Tenant() tenant: TenantContext,
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(oauthAppSchema)) body: z.infer<typeof oauthAppSchema>,
  ) {
    return this.oauthApps.save(tenant, provider, body);
  }

  /** Removes this org's app credentials for a provider. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Delete(':provider/oauth-app')
  removeOAuthApp(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.oauthApps.remove(tenant, provider);
  }

  // ---- OAuth 2.0 connection flow ----

  /** Starts the OAuth flow: returns the provider consent URL to redirect to. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Get(':provider/authorize')
  authorize(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.oauth.getAuthorizationUrl(tenant, provider);
  }

  /**
   * The provider's redirect target. Public — the provider (not the user's
   * session) calls it; the signed `state` is the authorization. Exchanges the
   * code for tokens then bounces the browser back to the app.
   */
  @Public()
  @Get('oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
    if (error) return res.redirect(`${appUrl}/integrations?error=${encodeURIComponent(error)}`);
    try {
      const { provider } = await this.oauth.handleCallback(code, state);
      return res.redirect(`${appUrl}/integrations?connected=${encodeURIComponent(provider)}`);
    } catch (e) {
      return res.redirect(`${appUrl}/integrations?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  /** Disconnects a provider: clears its stored tokens. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post(':provider/disconnect')
  disconnect(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.oauth.disconnect(tenant, provider);
  }

  // ---- CRM sync (sections 5–8, 14) ----

  /** This provider's sync config (enabled flag + field mapping) for the org. */
  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':provider/sync-config')
  async syncConfig(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return {
      config: await this.crmSync.getConfig(tenant.orgId, provider),
      meta: this.crmSync.meta(provider),
    };
  }

  /** Saves the sync toggle and field mapping. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Put(':provider/sync-config')
  saveSyncConfig(
    @Tenant() tenant: TenantContext,
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(syncConfigSchema)) body: z.infer<typeof syncConfigSchema>,
  ) {
    return this.crmSync.saveConfig(tenant, provider, body);
  }

  /** Manually pushes recent leads to the CRM now. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post(':provider/sync')
  syncNow(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.crmSync.syncNow(tenant, provider);
  }

  /** The sync log for a provider. */
  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':provider/sync-records')
  syncRecords(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.crmSync.records(tenant, provider);
  }
}
