import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { sniffImage } from '../uploads/storage.service';
import {
  addLeadActivitySchema,
  leadCaptureSchema,
  meetingResponseSchema,
  createLeadSchema,
  type AddLeadActivityInput,
  type CreateLeadInput,
  type JwtPayload,
  type LeadCaptureInput,
  type MeetingResponseInput,
} from '@vertex/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import type { TenantContext } from '@vertex/db';
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
    @Ip() ip: string,
  ) {
    return this.leads.capture(body, ip || 'unknown');
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

  /** Whether paper cards can be read here. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('scan')
  scanAvailable() {
    return this.leads.scanAvailable();
  }

  /** Reads the contact off a photo of a paper business card; nothing is saved. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post('scan')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } }))
  scanCard(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: JwtPayload) {
    if (!file) throw new BadRequestException('Send a photo of the card');
    // The file's own first bytes decide what it is, not the name it came with.
    const kind = sniffImage(file.buffer);
    if (!kind || !/^image\/(jpeg|png|webp)$/.test(kind.type)) throw new BadRequestException('Send a JPEG, PNG or WebP photo');
    return this.leads.scanCard(user.sub, { mediaType: kind.type, base64: file.buffer.toString('base64') });
  }

  /** Adds a lead by hand, or from what was read off a paper card. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post()
  create(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(createLeadSchema)) body: CreateLeadInput) {
    return this.leads.create(tenant, body);
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

  /** Accept or decline the meeting a visitor asked for; the visitor is emailed. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/meeting')
  respondToMeeting(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(meetingResponseSchema)) body: MeetingResponseInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leads.respondToMeeting(id, body, user.sub);
  }

  /** The meeting as a calendar file, to add to one's own calendar. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get(':id/meeting.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="meeting.ics"')
  meetingIcs(@Param('id') id: string) {
    return this.leads.meetingIcs(id);
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
