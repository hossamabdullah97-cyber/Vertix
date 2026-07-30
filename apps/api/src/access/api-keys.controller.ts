import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@vertex/db';
import { ApiKeysService } from './api-keys.service';
import { SCOPES } from './scopes';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * Workspace API key management. Managing credentials is restricted to admins
 * (section 18). The raw key is returned only on create/rotate.
 */
@UseGuards(RequireTenantGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  /** The catalog of grantable scopes. */
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('scopes')
  scopes() {
    return { scopes: SCOPES };
  }

  @Roles('OWNER', 'ADMIN')
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.keys.list(tenant);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.keys.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':id/rotate')
  rotate(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.keys.rotate(tenant, id);
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':id/revoke')
  revoke(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.keys.revoke(tenant, id);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.keys.remove(tenant, id);
  }
}
