import { Body, Controller, Get, Header, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { deleteAccountSchema, onboardingUpdateSchema, type DeleteAccountInput, type JwtPayload, type OnboardingUpdate } from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { OnboardingService } from './onboarding.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TwoStepExempt } from '../auth/decorators/two-step-exempt.decorator';
import { AccountService } from './account.service';
import { PersonRoute } from '../auth/decorators/person-route.decorator';

/** The signed-in person's own account: their data, and closing it. */
@TwoStepExempt()
@PersonRoute()
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly onboarding: OnboardingService,
  ) {}

  /** The getting-started steps, in the workspace open now, and how far along they are. */
  @Get('onboarding')
  onboardingView(@CurrentUser() user: JwtPayload, @Tenant() tenant?: TenantContext) {
    return this.onboarding.view(user.sub, tenant);
  }

  /** The welcome was seen, or the guide hidden or brought back. */
  @Patch('onboarding')
  onboardingUpdate(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(onboardingUpdateSchema)) body: OnboardingUpdate, @Tenant() tenant?: TenantContext) {
    return this.onboarding.update(user.sub, body, tenant);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="vertex-connect-my-data.json"')
  export(@CurrentUser() user: JwtPayload) {
    return this.account.export(user.sub);
  }

  @Get('deletion')
  preview(@CurrentUser() user: JwtPayload) {
    return this.account.preview(user.sub);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('delete')
  delete(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput) {
    return this.account.delete(user.sub, body);
  }
}
