import { Body, Controller, Get, Header, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { convertWorkspaceSchema, orgSecuritySchema, updateOrgSchema, type ConvertWorkspaceInput, type JwtPayload, type OrgSecurityInput, type UpdateOrgInput } from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { OrganizationsService } from './organizations.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrgId, Tenant } from '../auth/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TwoStepExempt } from '../auth/decorators/two-step-exempt.decorator';
import { PersonRoute } from '../auth/decorators/person-route.decorator';
import { Area } from '../auth/decorators/area.decorator';

@Area('workspace')
@Controller('orgs')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // The workspace switcher, so a member held at one workspace's two-step screen can leave for another.
  @TwoStepExempt()
  @PersonRoute()
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.orgs.listForUser(user.sub);
  }

  /** The current active organization — available to any member. */
  @TwoStepExempt()
  @Get('current')
  current(@OrgId() orgId: string) {
    return this.orgs.getCurrent(orgId);
  }

  /** Immutable audit trail for the active org (admins only). */
  @Roles('OWNER', 'ADMIN')
  @Get('audit-logs')
  auditLogs() {
    return this.audit.list();
  }

  /** Makes the owner's personal workspace a company's or team's, to invite people. */
  @Roles('OWNER')
  @Post('current/convert')
  async convert(@OrgId() orgId: string, @Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(convertWorkspaceSchema)) body: ConvertWorkspaceInput) {
    const org = await this.orgs.convertToTeam(orgId, body.name);
    await this.audit.log(tenant, 'org.converted_to_team', { targetType: 'organization', targetId: orgId, metadata: { name: org.name } });
    return org;
  }

  /** A personal workspace of one's own, for someone who only has a company's. */
  @TwoStepExempt()
  @PersonRoute()
  @Post('personal')
  createPersonal(@CurrentUser() user: JwtPayload) {
    return this.orgs.createPersonal(user.sub);
  }

  /** Update the active org's profile + branding (admins only). */
  @Roles('OWNER', 'ADMIN')
  @Patch('current')
  async updateCurrent(
    @OrgId() orgId: string,
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: UpdateOrgInput,
  ) {
    const updated = await this.orgs.updateCurrent(orgId, body);
    await this.audit.log(tenant, 'org.branding_updated', { targetType: 'organization', targetId: orgId, metadata: { name: updated.name } });
    await this.notifications.notifyOrgAdmins(orgId, tenant.userId, {
      type: 'org.branding_updated',
      category: 'ORGANIZATION',
      priority: 'LOW',
      title: 'Workspace settings updated',
      metadata: { name: updated.name },
    });
    return updated;
  }

  @Roles('OWNER', 'ADMIN')
  @Get('security')
  security(@OrgId() orgId: string) {
    return this.orgs.security(orgId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch('security')
  async updateSecurity(
    @OrgId() orgId: string,
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(orgSecuritySchema)) body: OrgSecurityInput,
  ) {
    const out = await this.orgs.updateSecurity(orgId, tenant.userId, body.require2fa);
    await this.audit.log(tenant, body.require2fa ? 'org.two_step_required' : 'org.two_step_optional', { targetType: 'organization', targetId: orgId });
    return out;
  }

  /** Everything in the workspace, as a JSON download (owners only). */
  @Roles('OWNER')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('current/export')
  @Header('Content-Disposition', 'attachment; filename="vertex-connect-workspace.json"')
  async export(@OrgId() orgId: string, @Tenant() tenant: TenantContext) {
    const data = await this.orgs.export(orgId);
    await this.audit.log(tenant, 'org.exported', { targetType: 'organization', targetId: orgId, metadata: { leads: data.leads.length, cards: data.cards.length } });
    return data;
  }
}
