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

  /** For someone who lost their phone and their recovery codes, once support has confirmed who they are. */
  @Post('users/:id/reset-2fa')
  resetTwoStep(@Param('id') userId: string, @CurrentUser() actor: JwtPayload) {
    return this.adminService.resetTwoStep(userId, actor.sub);
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

  /** Deleted workspaces that can still be restored, with when each is erased. */
  @Get('organizations/deleted')
  getDeletedOrganizations() {
    return this.adminService.getDeletedOrganizations();
  }

  @Post('organizations/:id/restore')
  restoreOrganization(@Param('id') orgId: string, @CurrentUser() actor: JwtPayload) {
    return this.adminService.restoreOrganization(orgId, actor.sub);
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

  // --- Platform chip registry -------------------------------------------
  // Only hardware registered here can be bound by a workspace, so these are the
  // most sensitive writes in the console: they decide what physical chips work.

  @Get('nfc-chips')
  getChips(
    @Query('status') status?: string,
    @Query('search') search?: string,
    /** An org id, or 'NONE' for open stock with no buyer recorded. */
    @Query('allocatedToOrgId') allocatedToOrgId?: string,
  ) {
    return this.adminService.getChips({ status, search, allocatedToOrgId });
  }

  @Get('nfc-chips/stats')
  getChipStats() {
    return this.adminService.getChipStats();
  }

  /** One chip — what a tap on the admin's phone posts. */
  @Post('nfc-chips')
  registerChip(
    @Body()
    body: {
      uid: string;
      hardwareType?: string;
      batchId?: string;
      note?: string;
      allocatedToOrgId?: string | null;
    },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.registerChip(body, actor.sub);
  }

  @Post('nfc-chips/batch')
  registerChipBatch(
    @Body()
    body: {
      uids: string[];
      hardwareType?: string;
      batchId?: string;
      allocatedToOrgId?: string | null;
    },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.registerChipBatch(body, actor.sub);
  }

  /**
   * Records the workspace a set of chips was sold to — by UID list or by whole
   * batch. Only that workspace can claim them afterwards. A null orgId returns
   * them to open stock.
   */
  @Post('nfc-chips/allocate')
  allocateChips(
    @Body() body: { uids?: string[]; batchId?: string; orgId: string | null },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.allocateChips(body, actor.sub);
  }

  @Patch('nfc-chips/:id/status')
  updateChipStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.adminService.updateChipStatus(id, status, actor.sub);
  }

  @Delete('nfc-chips/:id')
  removeChip(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.adminService.removeChip(id, actor.sub);
  }

  @Get('audit-logs')
  getAuditLogs(@Query('search') search?: string) {
    return this.adminService.getAuditLogs(search || '');
  }
}
