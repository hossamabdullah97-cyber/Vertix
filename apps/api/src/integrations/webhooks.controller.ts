import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@vertex/db';
import { WebhookService, WEBHOOK_EVENTS } from './webhook.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

const createSchema = z.object({
  url: z.string().url(),
  description: z.string().max(200).optional(),
  events: z.array(z.string()).min(1),
});
const updateSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().max(200).optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
});

/**
 * Outbound webhook management. Reading is open to managers; creating, rotating
 * secrets and deleting are restricted to workspace admins (section 18).
 */
@UseGuards(RequireTenantGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

  /** The catalog of subscribable events. */
  @Get('events')
  events() {
    return { events: WEBHOOK_EVENTS };
  }

  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.webhooks.list(tenant);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.webhooks.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.webhooks.update(tenant, id, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':id/rotate-secret')
  rotate(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.webhooks.rotateSecret(tenant, id);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.webhooks.remove(tenant, id);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('deliveries/log')
  deliveries(
    @Tenant() tenant: TenantContext,
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: string,
  ) {
    return this.webhooks.deliveries(tenant, { endpointId, status });
  }

  @Roles('OWNER', 'ADMIN')
  @Post('deliveries/:id/replay')
  replay(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.webhooks.replay(tenant, id);
  }
}
