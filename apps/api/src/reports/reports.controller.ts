import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthThrottleService, tooManyAttempts } from '../auth/auth-throttle.service';
import { WeeklyReportService } from './weekly-report.service';
import { OccasionReportService } from './occasion-report.service';

/** Previews a few times an hour: enough to see it, not to flood an inbox. */
const PREVIEW_LIMIT = 3;
const PREVIEW_WINDOW_MS = 60 * 60_000;

@UseGuards(RequireTenantGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly weekly: WeeklyReportService,
    private readonly throttle: AuthThrottleService,
    private readonly occasions: OccasionReportService,
  ) {}

  /** What an occasion (an exhibition, a launch) brought in, against an ordinary day. */
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get('occasions/:id')
  occasion(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.occasions.report(tenant, id);
  }

  /** Emails the caller this workspace's report for the last seven days, now. */
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('weekly/preview')
  async preview(@Tenant() tenant: TenantContext) {
    const key = `weekly-preview:${tenant.userId}`;
    const wait = await this.throttle.blockedFor(key, PREVIEW_LIMIT, PREVIEW_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);
    await this.throttle.hit(key, PREVIEW_WINDOW_MS);
    return this.weekly.preview(tenant.userId, tenant.orgId);
  }
}
