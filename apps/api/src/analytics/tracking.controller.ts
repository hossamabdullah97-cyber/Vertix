import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Who a signed-in browser belongs to, from the app session it sent along.
   * An expired session still says who it is (the signature is what proves
   * it); it is only ever used to leave an event out, never to open anything.
   */
  private async viewer(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    try {
      const claims = await this.jwt.verifyAsync<{ sub?: string }>(token, { secret: this.config.getOrThrow<string>('JWT_SECRET'), ignoreExpiration: true });
      return typeof claims.sub === 'string' ? claims.sub : undefined;
    } catch {
      return undefined;
    }
  }

  @Public()
  @Post('track')
  @HttpCode(200)
  async track(
    @Body(new ZodValidationPipe(trackEventSchema)) body: TrackEventInput,
    @Req() req: Request,
  ) {
    return this.analytics.track(body.slug, body.type, body.visitorId, {
      viewerId: await this.viewer(body.viewer),
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      referrer: req.get('referer') || undefined,
      metadata: body.metadata,
    });
  }
}
