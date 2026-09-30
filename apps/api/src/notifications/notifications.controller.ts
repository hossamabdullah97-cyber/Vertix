import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { leadAlertSettingsSchema, type JwtPayload, type LeadAlertSettingsInput } from '@vertex/shared';
import { NotificationsService } from './notifications.service';
import { LeadAlertsService } from './lead-alerts.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/** Notifications are recipient-scoped (per user), available in any workspace. */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly alerts: LeadAlertsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
    @Query('unread') unread?: string,
    @Query('archived') archived?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notifications.list(user.sub, {
      category,
      unread: unread === 'true',
      archived: archived === 'true',
      cursor: cursor || undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.notifications.unreadCount(user.sub) };
  }

  @Get('preferences')
  preferences(@CurrentUser() user: JwtPayload) {
    return this.notifications.getPreferences(user.sub);
  }

  @Patch('preferences')
  setPreference(
    @CurrentUser() user: JwtPayload,
    @Body() body: { category?: string; inApp?: boolean },
  ) {
    const category = String(body.category ?? '').trim();
    if (!category) return { ok: false as const };
    return this.notifications.setPreference(user.sub, category, body.inApp !== false);
  }

  /** Email and WhatsApp alerts for new leads. */
  @Get('lead-alerts')
  leadAlerts(@CurrentUser() user: JwtPayload) {
    return this.alerts.settings(user.sub);
  }

  @Patch('lead-alerts')
  setLeadAlerts(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(leadAlertSettingsSchema)) body: LeadAlertSettingsInput) {
    return this.alerts.update(user.sub, body);
  }

  @Post('lead-alerts/test')
  testLeadAlert(@CurrentUser() user: JwtPayload, @Body() body: { channel?: string; lang?: string } = {}) {
    const lang = body?.lang === 'ar' || body?.lang === 'en' ? body.lang : undefined;
    return this.alerts.sendTest(user.sub, body?.channel === 'email' ? 'email' : 'whatsapp', lang);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Patch(':id/unread')
  markUnread(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notifications.markUnread(user.sub, id);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notifications.archive(user.sub, id);
  }
}
