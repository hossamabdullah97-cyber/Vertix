import { Controller, Get, Param, Post } from '@nestjs/common';
import type { JwtPayload } from '@vertex/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TwoStepExempt } from '../auth/decorators/two-step-exempt.decorator';
import { InvitationsService } from './invitations.service';
import { PersonRoute } from '../auth/decorators/person-route.decorator';

/** The signed-in person's own invitations, from whichever workspace is open. */
@TwoStepExempt()
@PersonRoute()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.invitations.list(user.sub);
  }

  @Post(':orgId/accept')
  accept(@CurrentUser() user: JwtPayload, @Param('orgId') orgId: string) {
    return this.invitations.accept(user.sub, orgId);
  }

  @Post(':orgId/decline')
  decline(@CurrentUser() user: JwtPayload, @Param('orgId') orgId: string) {
    return this.invitations.decline(user.sub, orgId);
  }
}
