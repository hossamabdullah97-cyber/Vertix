import { Body, Controller, Delete, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createIncidentSchema, incidentUpdateSchema, type CreateIncidentInput, type IncidentUpdateInput } from '@vertex/shared';
import { Public } from '../auth/decorators/public.decorator';
import { PlatformScope } from '../auth/decorators/platform-scope.decorator';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StatusService } from './status.service';

/** The status page's data, for anyone. */
@SkipThrottle()
@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  view() {
    return this.status.view();
  }
}

/** Posting about outages and maintenance, and the latest checks, for the people who run the platform. */
@PlatformScope()
@Controller('admin/status')
@UseGuards(SuperAdminGuard)
export class AdminStatusController {
  constructor(private readonly status: StatusService) {}

  @Get('incidents')
  incidents() {
    return this.status.incidents();
  }

  @Get('checks')
  checks() {
    return this.status.latest();
  }

  /** Runs the checks now, rather than waiting for the minute. */
  @Post('checks')
  runChecks() {
    return this.status.runChecks();
  }

  @Post('incidents')
  create(@Body(new ZodValidationPipe(createIncidentSchema)) body: CreateIncidentInput) {
    return this.status.create(body);
  }

  @Post('incidents/:id/updates')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(incidentUpdateSchema)) body: IncidentUpdateInput) {
    return this.status.addUpdate(id, body);
  }

  @Delete('incidents/:id')
  remove(@Param('id') id: string) {
    return this.status.remove(id);
  }
}
