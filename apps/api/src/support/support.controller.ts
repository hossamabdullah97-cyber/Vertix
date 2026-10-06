import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { TenantContext } from '@vertex/db';
import { helpFeedbackSchema, supportRequestSchema, type HelpFeedbackInput, type JwtPayload, type SupportRequestInput } from '@vertex/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PersonRoute } from '../auth/decorators/person-route.decorator';
import { PlatformScope } from '../auth/decorators/platform-scope.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { TwoStepExempt } from '../auth/decorators/two-step-exempt.decorator';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SupportService } from './support.service';

/** The help page: writing to support, and saying whether an article helped. Anyone signed in, in a workspace or not. */
@TwoStepExempt()
@PersonRoute()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('requests')
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(supportRequestSchema)) body: SupportRequestInput,
    @Req() req: Request,
    @Tenant() tenant?: TenantContext,
  ) {
    const ua = req.headers['user-agent'];
    return this.support.create(user.sub, body, { tenant, userAgent: typeof ua === 'string' ? ua : null });
  }

  @Get('requests')
  mine(@CurrentUser() user: JwtPayload) {
    return this.support.mine(user.sub);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('feedback')
  feedback(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(helpFeedbackSchema)) body: HelpFeedbackInput) {
    return this.support.feedback(user.sub, body);
  }
}

/** Support requests and article feedback, for the people who run the platform. */
@PlatformScope()
@Controller('admin/support')
@UseGuards(SuperAdminGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.support.list(status);
  }

  @Get('feedback')
  feedback() {
    return this.support.feedbackSummary();
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.support.setClosed(id, true);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string) {
    return this.support.setClosed(id, false);
  }
}
