import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { JwtPayload } from '@vertex/shared';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/** Notifications are recipient-scoped (per user), available in any workspace. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
