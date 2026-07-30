import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { trackEventSchema, type TrackEventInput } from '@vertex/shared';
import { AnalyticsService } from './analytics.service';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

/** Public event tracking from the card page (views, clicks, saves, shares). */
@SkipThrottle()
@Controller()
export class TrackingController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post('track')
  @HttpCode(200)
  track(
    @Body(new ZodValidationPipe(trackEventSchema)) body: TrackEventInput,
    @Req() req: Request,
  ) {
    return this.analytics.track(body.slug, body.type, body.visitorId, {
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      referrer: req.get('referer') || undefined,
      metadata: body.metadata,
    });
  }
}
