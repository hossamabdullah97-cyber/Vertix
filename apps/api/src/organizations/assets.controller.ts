import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createAssetSchema, type CreateAssetInput } from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { AssetsService } from './assets.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('orgs/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list() {
    return this.assets.list();
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createAssetSchema)) body: CreateAssetInput,
  ) {
    return this.assets.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.assets.remove(id);
  }
}
