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
import { AutomationService } from './automation.service';
import { AUTOMATION_TEMPLATES } from './automation-templates';
import { WEBHOOK_EVENTS } from './webhook.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireScopes } from '../access/scopes.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists', 'gt', 'lt',
  ]),
  value: z.unknown().optional(),
});
const actionSchema = z.object({
  type: z.enum(['notify', 'task', 'webhook']),
  config: z.record(z.unknown()).default({}),
});
const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  trigger: z.string().min(1),
  matchType: z.enum(['ALL', 'ANY']).optional(),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
});
const updateSchema = createSchema.partial().extend({ enabled: z.boolean().optional() });

/**
 * No-code automation management. Reading is open to managers; creating and
 * editing rules is restricted to workspace admins (section 18).
 */
@UseGuards(RequireTenantGuard)
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationService) {}

  /** Trigger catalog (the same domain events the webhook engine fans out). */
  @Get('triggers')
  triggers() {
    return { triggers: WEBHOOK_EVENTS };
  }

  /** Predefined starting-point templates. */
  @Get('templates')
  templates() {
    return { templates: AUTOMATION_TEMPLATES };
  }

  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.automations.list(tenant);
  }

  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('runs')
  runs(@Tenant() tenant: TenantContext, @Query('automationId') automationId?: string) {
    return this.automations.runs(tenant, automationId);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.automations.create(tenant, body);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.automations.update(tenant, id, body);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.automations.remove(tenant, id);
  }
}
