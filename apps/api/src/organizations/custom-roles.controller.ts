import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { assignCustomRoleSchema, customRoleSchema, type CustomRoleInput } from '@vertex/shared';
import type { z } from 'zod';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomRolesService } from './custom-roles.service';

/** The workspace's own roles. Seeing them goes with seeing the team; changing them is for its owners and admins only. */
@UseGuards(RequireTenantGuard)
@Area('roles')
@Controller('orgs/roles')
export class CustomRolesController {
  constructor(private readonly roles: CustomRolesService) {}

  @Area('people')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list() {
    return this.roles.list();
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(customRoleSchema)) body: CustomRoleInput) {
    return this.roles.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Put('assign')
  assign(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(assignCustomRoleSchema)) body: z.infer<typeof assignCustomRoleSchema>) {
    return this.roles.assign(tenant, body.membershipId, body.customRoleId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(@Tenant() tenant: TenantContext, @Param('id') id: string, @Body(new ZodValidationPipe(customRoleSchema)) body: CustomRoleInput) {
    return this.roles.update(tenant, id, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.roles.remove(tenant, id);
  }
}
