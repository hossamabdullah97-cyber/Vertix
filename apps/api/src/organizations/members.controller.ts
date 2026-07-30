import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  inviteMemberSchema,
  updateMemberSchema,
  type InviteMemberInput,
  type UpdateMemberInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { MembersService } from './members.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('orgs/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list() {
    return this.members.list();
  }

  @Roles('OWNER', 'ADMIN')
  @Post('invite')
  invite(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput,
  ) {
    return this.members.invite(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.members.update(tenant, id, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.members.remove(tenant, id);
  }
}
