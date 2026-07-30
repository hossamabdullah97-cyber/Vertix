import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { GatewayService, type ScanContext } from './gateway.service';
import { Public } from '../auth/decorators/public.decorator';

/** Public NFC gateway. The physical tag URL points here: /api/t/:uid */
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
    res.redirect(302, result.redirectUrl);
  }

  /** JSON resolution — for native apps that render the result instead of redirecting. */
  @Public()
  @Get(':uid/resolve')
  resolve(@Param('uid') uid: string, @Req() req: Request) {
    return this.gateway.resolve(uid, this.buildContext(req));
  }
}
