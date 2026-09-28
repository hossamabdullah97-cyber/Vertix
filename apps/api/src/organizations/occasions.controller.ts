import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createOccasionSchema,
  updateOccasionSchema,
  type CreateOccasionInput,
  type UpdateOccasionInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { OccasionsService } from './occasions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

/** Everyone in the workspace sees the occasions on its charts; managers and up keep them. */
@UseGuards(RequireTenantGuard)
@Controller('orgs/occasions')
export class OccasionsController {
  constructor(private readonly occasions: OccasionsService) {}

  @Get()
  list() {
    return this.occasions.list();
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createOccasionSchema)) body: CreateOccasionInput,
  ) {
    return this.occasions.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOccasionSchema)) body: UpdateOccasionInput,
  ) {
    return this.occasions.update(tenant, id, body);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.occasions.remove(tenant, id);
  }
}
