import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { setGoalSchema, type SetGoalInput } from '@vertex/shared';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GoalsService } from './goals.service';

/** The workspace's goals and how far they have come. Anyone may look; the team's leads set them. */
@UseGuards(RequireTenantGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.goals.list(tenant);
  }

  @Put()
  set(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(setGoalSchema)) body: SetGoalInput) {
    return this.goals.set(tenant, body);
  }

  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.goals.remove(tenant, id);
  }
}
