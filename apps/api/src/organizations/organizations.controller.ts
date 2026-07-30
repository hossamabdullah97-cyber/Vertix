import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateOrgSchema, type JwtPayload, type UpdateOrgInput } from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { OrganizationsService } from './organizations.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrgId, Tenant } from '../auth/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orgs')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.orgs.listForUser(user.sub);
  }

  /** The current active organization — available to any member. */
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
}
