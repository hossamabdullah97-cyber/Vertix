import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { leadAlertSettingsSchema, pushSubscribeSchema, type JwtPayload, type LeadAlertSettingsInput, type PushSubscribeInput } from '@vertex/shared';
import { NotificationsService } from './notifications.service';
import { LeadAlertsService } from './lead-alerts.service';
import { PushService } from './push.service';
import { AuthThrottleService, tooManyAttempts } from '../auth/auth-throttle.service';

/** Test pushes one person may send an hour. */
const PUSH_TEST_LIMIT = 5;
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PersonRoute } from '../auth/decorators/person-route.decorator';

/** Notifications are recipient-scoped (per user), available in any workspace. */
@PersonRoute()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly alerts: LeadAlertsService,
    private readonly push: PushService,
    private readonly throttle: AuthThrottleService,
  ) {}

  /** Push on this server: its public key (null when off) and how many devices the user has on. */
  @Get('push')
  async pushStatus(@CurrentUser() user: JwtPayload) {
    return { publicKey: this.push.publicKey, devices: this.push.publicKey ? await this.push.deviceCount(user.sub) : 0 };
  }

  /** Turns push on for the calling device. */
  @Post('push/subscriptions')
  subscribePush(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeInput,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!this.push.publicKey) throw new ServiceUnavailableException('Push notifications are not set up on this server');
    return this.push.subscribe(user.sub, body, userAgent);
  }

  /** Turns push off for the calling device. */
  @Delete('push/subscriptions')
  unsubscribePush(@CurrentUser() user: JwtPayload, @Body() body: { endpoint?: string } = {}) {
    return this.push.unsubscribe(user.sub, typeof body?.endpoint === 'string' ? body.endpoint : '');
  }

  /** Sends the user's devices a test notification, so they can see it works. */
  @Post('push/test')
  async testPush(@CurrentUser() user: JwtPayload) {
    if (!this.push.publicKey) throw new ServiceUnavailableException('Push notifications are not set up on this server');
    const key = `push-test:${user.sub}`;
    const wait = await this.throttle.blockedFor(key, PUSH_TEST_LIMIT, 60 * 60_000);
    if (wait > 0) throw tooManyAttempts(wait);
    await this.throttle.hit(key, 60 * 60_000);
    const sent = await this.push.send(user.sub, { type: 'push.test', title: 'Notifications are on', priority: 'HIGH' });
    return { sent };
  }

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
