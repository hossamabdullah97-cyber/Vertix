import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { engagementPreviewSchema, unsubscribeSchema, type JwtPayload } from '@vertex/shared';
import type { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlatformScope } from '../auth/decorators/platform-scope.decorator';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EngagementService } from './engagement.service';

/** "Stop these emails", from the link in one, without signing in. */
@Controller('engagement')
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('unsubscribe')
  unsubscribe(@Body(new ZodValidationPipe(unsubscribeSchema)) body: z.infer<typeof unsubscribeSchema>) {
    return this.engagement.unsubscribe(body.u, body.t);
  }
}

/** What went out, a sample of each, and a sweep now, for the people who run the platform. */
@PlatformScope()
@Controller('admin/engagement')
@UseGuards(SuperAdminGuard)
export class AdminEngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  stats() {
    return this.engagement.stats();
  }

  @Post('preview')
  preview(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(engagementPreviewSchema)) body: z.infer<typeof engagementPreviewSchema>) {
    return this.engagement.preview(user.sub, body.kind, body.lang);
  }

  /** Sends what is due now, whatever the hour. */
  @Post('sweep')
  async sweep() {
    return { sent: await this.engagement.sweep(new Date(), { anyHour: true }) };
  }
}
