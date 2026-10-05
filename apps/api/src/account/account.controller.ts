import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { deleteAccountSchema, type DeleteAccountInput, type JwtPayload } from '@vertex/shared';
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
  constructor(private readonly account: AccountService) {}

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
