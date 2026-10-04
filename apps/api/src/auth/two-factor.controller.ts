import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { twoFactorCodeSchema, type JwtPayload, type TwoFactorCodeInput } from '@vertex/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from './decorators/current-user.decorator';
import { TwoStepExempt } from './decorators/two-step-exempt.decorator';
import { TwoFactorService } from './two-factor.service';

const CODE_PAGE_LIMIT = { default: { limit: 20, ttl: 60_000 } };

/** The signed-in person's own two-step verification. */
@TwoStepExempt()
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  status(@CurrentUser() user: JwtPayload) {
    return this.twoFactor.status(user.sub);
  }

  @Post('setup')
  setup(@CurrentUser() user: JwtPayload) {
    return this.twoFactor.setup(user.sub);
  }

  @Throttle(CODE_PAGE_LIMIT)
  @Post('enable')
  enable(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput) {
    return this.twoFactor.enable(user.sub, body.code);
  }

  @Throttle(CODE_PAGE_LIMIT)
  @Post('disable')
  disable(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput) {
    return this.twoFactor.disable(user.sub, body.code);
  }

  @Throttle(CODE_PAGE_LIMIT)
  @Post('recovery-codes')
  recoveryCodes(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput) {
    return this.twoFactor.regenerateRecoveryCodes(user.sub, body.code);
  }
}
