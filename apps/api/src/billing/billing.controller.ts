import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  PLAN_LIMITS,
  checkoutSchema,
  type CheckoutInput,
  type JwtPayload,
} from '@vertex/shared';
import { BillingService } from './billing.service';
import { LimitsService } from './limits.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OrgId } from '../auth/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly limits: LimitsService,
  ) {}

  /** Public pricing table. */
  @Public()
  @Get('plans')
  plans() {
    return { plans: PLAN_LIMITS, billingEnabled: this.billing.enabled };
  }

  /** Current org subscription + usage. */
  @UseGuards(RequireTenantGuard)
  @Get('subscription')
  subscription(@OrgId() orgId: string) {
    return this.limits.usage(orgId);
  }

  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('checkout')
  checkout(
    @OrgId() orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
  ) {
    return this.billing.createCheckout(orgId, body.plan, user.email);
  }

  @UseGuards(RequireTenantGuard)
  @Roles('OWNER')
  @Post('portal')
  portal(@OrgId() orgId: string) {
    return this.billing.createPortal(orgId);
  }

  /** Stripe webhook — verifies the raw body signature. */
  @Public()
  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billing.handleWebhook(req.rawBody ?? Buffer.from(''), signature);
  }
}
