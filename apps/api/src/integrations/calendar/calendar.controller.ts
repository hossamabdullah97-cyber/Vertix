import { Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { Tenant } from '../../auth/decorators/tenant.decorator';
import { RequireTenantGuard } from '../../auth/guards/require-tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthService } from '../oauth.service';
import { GoogleCalendarService } from './google-calendar.service';

/**
 * A person's own calendar. Unlike the workspace's integrations (an admin's
 * to connect), everyone connects their own, from their card's meeting hours.
 */
@UseGuards(RequireTenantGuard)
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: GoogleCalendarService,
    private readonly oauth: OAuthService,
  ) {}

  /**
   * Whether a calendar can be connected here, and whose is: the reader's, or
   * (for a card) its owner's, whose address stays theirs.
   */
  @Get()
  async status(@Tenant() tenant: TenantContext, @Query('cardId') cardId?: string) {
    let ownerId = tenant.userId;
    let ownerName: string | null = null;
    if (cardId) {
      const card = await this.prisma.client.card.findFirst({ where: { id: cardId }, select: { ownerId: true, owner: { select: { name: true, email: true } } } });
      if (!card) throw new NotFoundException('Card not found');
      ownerId = card.ownerId;
      ownerName = card.owner.name || card.owner.email.split('@')[0]!;
    }
    const mine = ownerId === tenant.userId;
    const conn = await this.calendar.connection(tenant.orgId, ownerId);
    return {
      available: await this.calendar.available(tenant.orgId),
      mine,
      owner: mine ? null : ownerName,
      google: conn
        ? { status: conn.status, account: mine ? conn.externalAccountName : null, since: conn.updatedAt, problem: mine ? conn.lastError : null }
        : null,
    };
  }

  /** Where to send the browser to connect one's own Google Calendar, coming back to `returnTo`. */
  @Get('google/authorize')
  authorize(@Tenant() tenant: TenantContext, @Query('returnTo') returnTo?: string) {
    return this.oauth.getAuthorizationUrl(tenant, 'google_calendar', { returnTo });
  }

  /** Stops using one's own Google Calendar. */
  @Post('google/disconnect')
  disconnect(@Tenant() tenant: TenantContext) {
    return this.oauth.disconnect(tenant, 'google_calendar');
  }
}
