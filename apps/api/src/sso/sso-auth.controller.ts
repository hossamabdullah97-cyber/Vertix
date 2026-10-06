import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ssoCallbackSchema, ssoStartSchema, type SsoCallbackInput } from '@vertex/shared';
import { Public } from '../auth/decorators/public.decorator';
import { TwoStepExempt } from '../auth/decorators/two-step-exempt.decorator';
import { Client } from '../auth/decorators/client-info.decorator';
import type { ClientInfo } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SsoService } from './sso.service';

const LIMIT = { default: { limit: Number(process.env.AUTH_RATE_LIMIT) || 20, ttl: 60_000 } };

/** Signing in through a company's own provider: where to go, and coming back. */
@TwoStepExempt()
@Controller('auth/sso')
export class SsoAuthController {
  constructor(private readonly sso: SsoService) {}

  @Public()
  @Throttle(LIMIT)
  @Post('start')
  @HttpCode(200)
  start(@Body(new ZodValidationPipe(ssoStartSchema)) body: { email: string }) {
    return this.sso.start(body.email);
  }

  @Public()
  @Throttle(LIMIT)
  @Post('callback')
  @HttpCode(200)
  callback(@Body(new ZodValidationPipe(ssoCallbackSchema)) body: SsoCallbackInput, @Client() client: ClientInfo) {
    return this.sso.callback(body.code, body.state, client);
  }
}
