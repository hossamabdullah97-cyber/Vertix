import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { ssoConnectionSchema, ssoDomainSchema, ssoSettingsSchema, type SsoConnectionInput, type SsoSettingsInput } from '@vertex/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { Area } from '../auth/decorators/area.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SsoService } from './sso.service';

/** A workspace's single sign-on. Who may sign in and how is for its owners and admins, never a custom role. */
@UseGuards(RequireTenantGuard)
@Area('roles')
@Roles('OWNER', 'ADMIN')
@Controller('orgs/sso')
export class SsoSettingsController {
  constructor(private readonly sso: SsoService) {}

  @Get()
  view(@Tenant() tenant: TenantContext) {
    return this.sso.view(tenant.orgId);
  }

  @Put()
  save(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(ssoConnectionSchema)) body: SsoConnectionInput) {
    return this.sso.save(tenant, body);
  }

  @Patch()
  settings(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(ssoSettingsSchema)) body: SsoSettingsInput) {
    return this.sso.settings(tenant, body);
  }

  @Delete()
  remove(@Tenant() tenant: TenantContext) {
    return this.sso.remove(tenant);
  }

  @Post('test')
  @HttpCode(200)
  test(@Tenant() tenant: TenantContext) {
    return this.sso.startTest(tenant);
  }

  @Post('domains')
  addDomain(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(ssoDomainSchema)) body: { domain: string }) {
    return this.sso.addDomain(tenant, body.domain);
  }

  @Post('domains/:id/verify')
  @HttpCode(200)
  verifyDomain(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.sso.verifyDomain(tenant, id);
  }

  @Delete('domains/:id')
  removeDomain(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.sso.removeDomain(tenant, id);
  }
}
