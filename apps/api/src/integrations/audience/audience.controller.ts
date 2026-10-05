import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@vertex/db';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireTenantGuard } from '../../auth/guards/require-tenant.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireScopes } from '../../access/scopes.decorator';
import { Tenant } from '../../auth/decorators/tenant.decorator';
import { AudienceService } from './audience.service';
import { isAudienceProvider, type AudienceProvider } from './audience-connectors';

const credsSchema = z.object({ apiKey: z.string().min(1).max(500), accountUrl: z.string().max(300).optional() });
const connectSchema = credsSchema.extend({ listId: z.string().min(1).max(100), autoSync: z.boolean().optional() });
const settingsSchema = z.object({ listId: z.string().min(1).max(100).optional(), autoSync: z.boolean().optional() });

function audience(provider: string): AudienceProvider {
  if (!isAudienceProvider(provider)) throw new BadRequestException(`${provider} is not an email-marketing integration.`);
  return provider;
}

/**
 * Brevo, ActiveCampaign and Klaviyo (see AudienceService). Disconnecting goes
 * through the shared POST /integrations/:provider/disconnect.
 */
@UseGuards(RequireTenantGuard)
@Controller('integrations')
export class AudienceController {
  constructor(private readonly audience: AudienceService) {}

  /** Checks a key and lists the account's lists. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post(':provider/audience/check')
  check(@Param('provider') provider: string, @Body(new ZodValidationPipe(credsSchema)) body: z.infer<typeof credsSchema>) {
    return this.audience.check(audience(provider), body);
  }

  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':provider/audience')
  settings(@Param('provider') provider: string) {
    return this.audience.settings(audience(provider));
  }

  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN')
  @Get(':provider/audience/lists')
  lists(@Param('provider') provider: string) {
    return this.audience.connectedLists(audience(provider));
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Put(':provider/audience')
  connect(@Tenant() tenant: TenantContext, @Param('provider') provider: string, @Body(new ZodValidationPipe(connectSchema)) body: z.infer<typeof connectSchema>) {
    return this.audience.connect(tenant, audience(provider), body);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Patch(':provider/audience')
  update(@Tenant() tenant: TenantContext, @Param('provider') provider: string, @Body(new ZodValidationPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    return this.audience.updateSettings(tenant, audience(provider), body);
  }

  /** Sends the newest leads now. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post(':provider/audience/sync')
  sync(@Tenant() tenant: TenantContext, @Param('provider') provider: string) {
    return this.audience.syncRecent(tenant, audience(provider));
  }
}
