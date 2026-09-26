import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  addLeadActivitySchema,
  leadCaptureSchema,
  type AddLeadActivityInput,
  type LeadCaptureInput,
} from '@vertex/shared';
import { LeadsService } from './leads.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../auth/decorators/public.decorator';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { RequireScopes } from '../access/scopes.decorator';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** Public: capture a lead from a card's engagement workflow. */
  @Public()
  @Post('capture')
  capture(
    @Body(new ZodValidationPipe(leadCaptureSchema)) body: LeadCaptureInput,
  ) {
    return this.leads.capture(body);
  }

  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get()
  list() {
    return this.leads.list();
  }

  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('stages')
  stages() {
    return this.leads.listStages();
  }

  // Note: this dynamic route must stay AFTER the static 'stages' route above.
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/activities')
  addActivity(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addLeadActivitySchema)) body: AddLeadActivityInput,
  ) {
    return this.leads.addActivity(id, body);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { stageId?: string | null; temperature?: string; value?: number; name?: string | null; email?: string | null; phone?: string | null; company?: string | null },
  ) {
    return this.leads.update(id, body);
  }
}
