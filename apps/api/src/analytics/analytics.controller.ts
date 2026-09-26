import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { OrgId } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

/** Parses a from/to range, defaulting to the last 30 days. */
function range(from?: string, to?: string) {
  const t = to ? new Date(to) : new Date();
  const f = from ? new Date(from) : new Date(t.getTime() - 30 * 86_400_000);
  return { f, t };
}

@RequireScopes('analytics:read')
@UseGuards(RequireTenantGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(
    @OrgId() orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { f, t } = range(from, to);
    return this.analytics.overview(orgId, f, t);
  }

  @Get('timeseries')
  timeseries(
    @OrgId() orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { f, t } = range(from, to);
    return this.analytics.timeseries(orgId, f, t);
  }

  @Get('cards/:cardId')
  cardStats(@Param('cardId') cardId: string) {
    return this.analytics.cardStats(cardId);
  }

  @Get('top-cards')
  topCards(@Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = range(from, to);
    return this.analytics.topCards(f, t);
  }

  @Get('referrers')
  referrers(@Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = range(from, to);
    return this.analytics.referrers(f, t);
  }
}
