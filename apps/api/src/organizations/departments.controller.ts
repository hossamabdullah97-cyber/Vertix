import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { DepartmentsService } from './departments.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('orgs/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list() {
    return this.departments.list();
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departments.findOne(id);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput,
  ) {
    return this.departments.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) body: UpdateDepartmentInput,
  ) {
    return this.departments.update(tenant, id, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.departments.remove(tenant, id);
  }
}
