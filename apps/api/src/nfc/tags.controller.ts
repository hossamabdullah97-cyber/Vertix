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
import {
  createTagSchema,
  createTagsBatchSchema,
  updateTagSchema,
  assignTagSchema,
  type CreateTagInput,
  type CreateTagsBatchInput,
  type UpdateTagInput,
  type AssignTagInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { TagsService } from './tags.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

@UseGuards(RequireTenantGuard)
@Roles('OWNER', 'ADMIN', 'MANAGER')
@Controller('nfc/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTagSchema)) body: CreateTagInput,
  ) {
    return this.tags.create(tenant, body);
  }

  @Post('batch')
  createBatch(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTagsBatchSchema))
    body: CreateTagsBatchInput,
  ) {
    return this.tags.createBatch(tenant, body);
  }

  @RequireScopes('nfc:read')
  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
  ) {
    return this.tags.list(tenant, { batchId, status });
  }

  @RequireScopes('nfc:read')
  @Get(':id')
  findOne(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tags.findOne(tenant, id);
  }

  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTagSchema)) body: UpdateTagInput,
  ) {
    return this.tags.update(tenant, id, body);
  }

  @Post(':id/assign')
  assign(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignTagSchema)) body: AssignTagInput,
  ) {
    return this.tags.assign(tenant, id, body.cardId);
  }

  @Post(':id/unassign')
  unassign(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tags.unassign(tenant, id);
  }

  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tags.remove(tenant, id);
  }
}
