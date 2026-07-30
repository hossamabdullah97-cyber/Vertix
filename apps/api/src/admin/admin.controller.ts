import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlatformScope } from '../auth/decorators/platform-scope.decorator';
import type { JwtPayload } from '@vertex/shared';

/**
 * The platform admin console — the only surface that reads and writes across
 * organizations. @PlatformScope grants that on purpose; every other controller
 * stays scoped to one tenant.
 */
@PlatformScope()
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('kpis')
  getKPIs() {
    return this.adminService.getDashboardKPIs();
  }

  @Get('users')
  getUsers(@Query('search') search?: string) {
    return this.adminService.getUsers(search || '');
  }

  @Post('users')
  createUser(
    @Body() body: { email: string; name?: string; password?: string; organizationName: string; isSuperAdmin?: boolean },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.createUser(body, actor.sub);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id') userId: string,
    @Body('status') status: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.updateUserStatus(userId, status, actor.sub);
  }

  @Post('users/:id/impersonate')
  impersonate(
    @Param('id') userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.impersonateUser(userId, actor.sub);
  }

  @Get('organizations')
  getOrganizations(@Query('search') search?: string) {
    return this.adminService.getOrganizations(search || '');
  }

  @Patch('organizations/:id/plan')
  updateOrganizationPlan(
    @Param('id') orgId: string,
    @Body('plan') plan: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.updateOrganizationPlan(orgId, plan, actor.sub);
  }

  @Post('organizations')
  createOrganization(
    @Body() body: { name: string; plan?: string; ownerEmail: string; ownerName?: string; ownerPassword?: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.createOrganization(body, actor.sub);
  }

  @Patch('organizations/:id/status')
  updateOrganizationStatus(
    @Param('id') orgId: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.updateOrganizationStatus(orgId, isActive, actor.sub);
  }

  @Delete('organizations/:id')
  deleteOrganization(
    @Param('id') orgId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.deleteOrganization(orgId, actor.sub);
  }

  @Patch('organizations/:id/owner')
  updateOrganizationOwner(
    @Param('id') orgId: string,
    @Body() body: { ownerEmail: string; ownerName?: string; ownerPassword?: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.updateOrganizationOwner(orgId, body, actor.sub);
  }

  @Get('feature-flags')
  getFeatureFlags() {
    return this.adminService.getFeatureFlags();
  }

  @Patch('feature-flags/:id/toggle')
  toggleFeatureFlag(
    @Param('id') flagId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.toggleFeatureFlag(flagId, actor.sub);
  }

  @Get('queue-jobs')
  getQueueJobs() {
    return this.adminService.getQueueJobs();
  }

  @Post('queue-jobs/:id/action')
  triggerJobAction(
    @Param('id') jobId: string,
    @Body('action') action: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.triggerJobAction(jobId, action, actor.sub);
  }

  @Get('audit-logs')
  getAuditLogs(@Query('search') search?: string) {
    return this.adminService.getAuditLogs(search || '');
  }
}
