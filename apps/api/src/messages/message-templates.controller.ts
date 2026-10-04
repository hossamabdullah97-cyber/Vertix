import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import {
  createMessageTemplateSchema,
  updateMessageTemplateSchema,
  type CreateMessageTemplateInput,
  type UpdateMessageTemplateInput,
} from '@vertex/shared';
import { MessageTemplatesService } from './message-templates.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireScopes } from '../access/scopes.decorator';

/** Ready messages: everyone in the workspace uses them; managers and up shape them. */
@UseGuards(RequireTenantGuard)
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @RequireScopes('crm:read')
  @Get()
  list(@Tenant() tenant: TenantContext, @Query('lang') lang?: string) {
    return this.templates.list(tenant, lang === 'ar' ? 'ar' : 'en');
  }

  @RequireScopes('crm:write')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(createMessageTemplateSchema)) body: CreateMessageTemplateInput) {
    return this.templates.create(tenant, body);
  }

  @RequireScopes('crm:write')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMessageTemplateSchema)) body: UpdateMessageTemplateInput,
  ) {
    return this.templates.update(tenant, id, body);
  }

  @RequireScopes('crm:write')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.templates.remove(tenant, id);
  }
}
