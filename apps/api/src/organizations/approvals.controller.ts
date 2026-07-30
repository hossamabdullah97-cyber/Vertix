import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createApprovalSchema,
  resolveApprovalSchema,
  type CreateApprovalInput,
  type ResolveApprovalInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { ApprovalsService } from './approvals.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('orgs/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list() {
    return this.approvals.list();
  }

  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createApprovalSchema)) body: CreateApprovalInput,
  ) {
    return this.approvals.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id/resolve')
  resolve(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveApprovalSchema)) body: ResolveApprovalInput,
  ) {
    return this.approvals.resolve(tenant, id, body);
  }
}
