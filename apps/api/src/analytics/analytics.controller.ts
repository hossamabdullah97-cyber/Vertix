import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import type { TenantContext } from '@vertex/db';
import { OrgId, Tenant } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

/** Parses a from/to range, defaulting to the last 30 days. */
function range(from?: string, to?: string) {
  const t = to ? new Date(to) : new Date();
  const f = from ? new Date(from) : new Date(t.getTime() - 30 * 86_400_000);
  // A range from a hand-edited address is refused plainly, not passed on to the database.
  if (Number.isNaN(t.getTime()) || Number.isNaN(f.getTime())) throw new BadRequestException('The start and end of the period must be dates');
  if (f > t) throw new BadRequestException('The period must start before it ends');
  return { f, t };
}

@RequireScopes('analytics:read')
@UseGuards(RequireTenantGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(
    @Tenant() tenant: TenantContext,
    @OrgId() orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { f, t } = range(from, to);
    return this.analytics.overview(orgId, f, t, AnalyticsService.ownerOf(tenant));
  }

  @Get('timeseries')
  timeseries(
    @Tenant() tenant: TenantContext,
    @OrgId() orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { f, t } = range(from, to);
    return this.analytics.timeseries(orgId, f, t, AnalyticsService.ownerOf(tenant));
  }

  @Get('cards/:cardId')
  cardStats(@Tenant() tenant: TenantContext, @Param('cardId') cardId: string) {
    return this.analytics.cardStats(cardId, AnalyticsService.ownerOf(tenant));
  }

  @Get('top-cards')
  topCards(@Tenant() tenant: TenantContext, @Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = range(from, to);
    return this.analytics.topCards(f, t, 5, AnalyticsService.ownerOf(tenant));
  }

  /** Per-chip performance: taps, people reached, and clients produced. */
  @Get('nfc-tags')
  tagPerformance(
    @Tenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const { f, t } = range(from, to);
    // A whole number between 1 and 500; anything else falls back to the default.
    const n = Number(limit);
    const take = limit && Number.isInteger(n) && n > 0 ? Math.min(n, 500) : undefined;
    return this.analytics.tagPerformance(f, t, take, AnalyticsService.ownerOf(tenant));
  }

  /** Standings for the team members carrying the hardware. */
  @Get('members')
  memberPerformance(
    @Tenant() tenant: TenantContext,
    @OrgId() orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { f, t } = range(from, to);
    return this.analytics.memberPerformance(orgId, f, t, AnalyticsService.ownerOf(tenant));
  }

  @Get('referrers')
  referrers(@Tenant() tenant: TenantContext, @Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = range(from, to);
    return this.analytics.referrers(f, t, 6, AnalyticsService.ownerOf(tenant));
  }
}
