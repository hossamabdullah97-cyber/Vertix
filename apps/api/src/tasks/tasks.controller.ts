import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@vertex/shared';
import { TasksService } from './tasks.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

@UseGuards(RequireTenantGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @RequireScopes('crm:read')
  @Get()
  list(@Query('leadId') leadId?: string) {
    return this.tasks.list(leadId);
  }

  @RequireScopes('crm:write')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ) {
    return this.tasks.create(tenant.orgId, body);
  }

  @RequireScopes('crm:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ) {
    return this.tasks.update(id, body);
  }

  @RequireScopes('crm:write')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tasks.remove(id);
  }
}
