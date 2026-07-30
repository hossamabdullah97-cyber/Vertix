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
  createTeamSchema,
  updateTeamSchema,
  type CreateTeamInput,
  type UpdateTeamInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { TeamsService } from './teams.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('orgs/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get()
  list() {
    return this.teams.list();
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teams.findOne(id);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput,
  ) {
    return this.teams.create(tenant, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTeamSchema)) body: UpdateTeamInput,
  ) {
    return this.teams.update(tenant, id, body);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.teams.remove(tenant, id);
  }
}
