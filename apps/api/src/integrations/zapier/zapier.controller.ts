import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@vertex/db';
import { Tenant } from '../../auth/decorators/tenant.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Area } from '../../auth/decorators/area.decorator';
import { RequireTenantGuard } from '../../auth/guards/require-tenant.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireScopes } from '../../access/scopes.decorator';
import { ZapierService } from './zapier.service';

const subscribeSchema = z.object({ hookUrl: z.string().url().max(2000), event: z.string().min(1).max(60) });

/**
 * For Zapier: the Vertex Connect app there signs in with an API key and
 * calls these; the Integrations page uses them too, for a Zap started from
 * a "Catch Hook".
 */
@Area('integrations')
@UseGuards(RequireTenantGuard)
@Controller('zapier')
export class ZapierController {
  constructor(private readonly zapier: ZapierService) {}

  /** Who the key belongs to: Zapier's test of the connection, and its name. */
  @RequireScopes('crm:read')
  @Get('me')
  me(@Tenant() tenant: TenantContext) {
    return this.zapier.me(tenant);
  }

  /** The workspace's Zaps listening for events. */
  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('hooks')
  hooks() {
    return this.zapier.hooks();
  }

  /** A Zap turned on: send it every `event`. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post('hooks')
  subscribe(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(subscribeSchema)) body: z.infer<typeof subscribeSchema>) {
    return this.zapier.subscribe(tenant, body);
  }

  /** A Zap turned off or deleted. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Delete('hooks/:id')
  unsubscribe(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.zapier.unsubscribe(tenant, id);
  }

  /** Sends a Zap an example of its event now. */
  @Roles('OWNER', 'ADMIN')
  @Post('hooks/:id/test')
  test(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.zapier.test(tenant, id);
  }

  /** Examples of an event to map fields from while building a Zap. */
  @RequireScopes('crm:read')
  @Get('samples/:event')
  samples(@Tenant() tenant: TenantContext, @Param('event') event: string) {
    return this.zapier.samples(tenant, event);
  }
}
