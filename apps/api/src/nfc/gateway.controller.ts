import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { GatewayService, type ScanContext } from './gateway.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Public NFC gateway: /api/t/:uid. A chip carries either this URL or the web
 * app's /t/:uid, which forwards here with the visitor's id (apps/web/app/t).
 */
@SkipThrottle()
@Controller('t')
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  private buildContext(req: Request): ScanContext {
    return {
      visitorId: (req.query.v as string) || undefined,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      referrer: req.get('referer') || undefined,
      apiBaseUrl: `${req.protocol}://${req.get('host')}/api`,
    };
  }

  /** Tap entry point — runs the pipeline and redirects to the resolved destination. */
  @Public()
  @Get(':uid')
  async tap(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.gateway.resolve(uid, this.buildContext(req));
    // Every tap has to reach the gateway to be counted and to follow the
    // chip if it is moved to another card, so no cache may keep the answer.
    res.set('Cache-Control', 'no-store');
    res.redirect(302, result.redirectUrl);
  }

  /** JSON resolution — for native apps that render the result instead of redirecting. */
  @Public()
  @Get(':uid/resolve')
  async resolve(@Param('uid') uid: string, @Req() req: Request) {
    const result = await this.gateway.resolve(uid, this.buildContext(req));
    // An app renders its own message for these; the redirect sends a browser
    // to the web's page instead.
    if (result.state === 'unknown' || result.state === 'disabled') {
      throw new NotFoundException('Unknown or disabled tag');
    }
    return result;
  }
}
