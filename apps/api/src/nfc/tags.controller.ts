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
  setTagHolderSchema,
  type CreateTagInput,
  type CreateTagsBatchInput,
  type UpdateTagInput,
  type AssignTagInput,
  type SetTagHolderInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { TagsService } from './tags.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

/**
 * Roles are set per route rather than on the controller.
 *
 * An employee registers and links their own chip — that is how a member's
 * hardware comes to be tied to them — but stock operations (bulk import,
 * handing a chip to someone else, editing or deleting one) stay with a manager.
 * TagsService enforces the matching data rules: an employee is always recorded
 * as the holder, sees only their own tags, and can link only their own cards.
 */
@UseGuards(RequireTenantGuard)
@Roles('OWNER', 'ADMIN', 'MANAGER')
@Controller('nfc/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE')
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
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('assignedUserId') assignedUserId?: string,
  ) {
    return this.tags.list(tenant, { batchId, status, assignedUserId });
  }

  @RequireScopes('nfc:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE')
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

  /** Hands the chip to a member, or clears its holder with a null userId. */
  @Post(':id/holder')
  setHolder(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setTagHolderSchema)) body: SetTagHolderInput,
  ) {
    return this.tags.setHolder(tenant, id, body.userId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  @Post(':id/assign')
  assign(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignTagSchema)) body: AssignTagInput,
  ) {
    return this.tags.assign(tenant, id, body.cardId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE')
  @Post(':id/unassign')
  unassign(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tags.unassign(tenant, id);
  }

  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tags.remove(tenant, id);
  }
}
