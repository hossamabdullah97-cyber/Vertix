import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PLAN_LIMITS, billingDetailsSchema, checkoutSchema, type BillingDetails, type CheckoutInput, type JwtPayload } from '@vertex/shared';
import { InvoicesService } from './invoices.service';
import { BillingService } from './billing.service';
import { LimitsService } from './limits.service';
import { CURRENCY } from './prices';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OrgId } from '../auth/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { assertEmailVerified } from '../auth/verified-email';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly limits: LimitsService,
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Public pricing table: the limits, and the monthly prices in pounds. */
  @Public()
  @Get('plans')
  plans() {
    const prices = this.billing.prices();
    return {
      plans: PLAN_LIMITS,
      prices,
      currency: CURRENCY,
      billingEnabled: this.billing.enabled,
      onSale: { PERSONAL: this.billing.sells('PERSONAL'), PRO: this.billing.sells('PRO'), BUSINESS: this.billing.sells('BUSINESS') },
    };
  }

  /** Current org subscription + usage. */
  @UseGuards(RequireTenantGuard)
  @Get('subscription')
  subscription(@OrgId() orgId: string) {
    return this.limits.usage(orgId);
  }

  /** Opens Paymob's checkout for a plan; the answer is the page to go to. */
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('checkout')
  async checkout(
    @OrgId() orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
    @Req() req: Request,
  ) {
    await assertEmailVerified(this.prisma.client, user.sub);
    const me = await this.prisma.client.user.findUnique({ where: { id: user.sub }, select: { name: true, email: true } });
    return this.billing.createCheckout(
      orgId,
      body.plan,
      { email: me?.email ?? user.email, name: me?.name ?? null, phone: body.phone },
      `${req.protocol}://${req.get('host')}`,
    );
  }

  /** The workspace's invoices, one for each payment, newest first. */
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Get('invoices')
  listInvoices() {
    return this.invoices.list();
  }

  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Get('invoices/:id')
  invoice(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  /** Who invoices are made out to. */
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Get('details')
  details(@OrgId() orgId: string) {
    return this.invoices.details(orgId);
  }

  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('details')
  setDetails(@OrgId() orgId: string, @Body(new ZodValidationPipe(billingDetailsSchema)) body: BillingDetails) {
    return this.invoices.setDetails(orgId, body);
  }

  /** Stops the renewals; the plan stays until the paid period ends. */
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER')
  @Post('cancel')
  cancel(@OrgId() orgId: string) {
    return this.billing.cancel(orgId);
  }

  /**
   * Paymob's callbacks: payments processed and subscription changes. Only
   * ids are taken from the body, and each is checked with Paymob itself.
   */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post('paymob/webhook')
  webhook(@Body() body: unknown) {
    return this.billing.handleCallback(body);
  }
}
