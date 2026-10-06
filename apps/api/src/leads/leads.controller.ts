import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
  leadContactSchema,
  type LeadContactInput,
  leadCaptureSchema,
  meetingResponseSchema,
  createLeadSchema,
  type AddLeadActivityInput,
  type CreateLeadInput,
  type JwtPayload,
  type LeadCaptureInput,
  type MeetingResponseInput,
  mergeLeadsSchema,
  type MergeLeadsInput,
  dismissDuplicatesSchema,
  type DismissDuplicatesInput,
  importLeadsSchema,
  type ImportLeadsInput,
} from '@vertex/shared';
import { LeadImportService } from './lead-import.service';
import { LeadMergeService } from './lead-merge.service';
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
  constructor(
    private readonly leads: LeadsService,
    private readonly merges: LeadMergeService,
    private readonly imports: LeadImportService,
  ) {}

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
  list(@Tenant() tenant: TenantContext) {
    return this.leads.list(tenant);
  }

  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('stages')
  stages() {
    return this.leads.listStages();
  }

  /** Leads that look like one person: the same email or phone number. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('duplicates')
  duplicates(@Tenant() tenant: TenantContext) {
    return this.merges.duplicates(tenant);
  }

  /** The groups marked as different people, for everyone in the workspace. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('duplicates/dismissed')
  dismissedDuplicates() {
    return this.merges.dismissed();
  }

  /** "Not the same person". */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post('duplicates/dismiss')
  dismissDuplicates(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(dismissDuplicatesSchema)) body: DismissDuplicatesInput) {
    return this.merges.dismiss(tenant, body.leadIds);
  }

  /** Makes the given duplicates part of this lead. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/merge')
  merge(@Tenant() tenant: TenantContext, @Param('id') id: string, @Body(new ZodValidationPipe(mergeLeadsSchema)) body: MergeLeadsInput) {
    return this.merges.merge(tenant, id, body.duplicateIds);
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

  /** Leads from a spreadsheet, in batches; with dryRun, only what would happen. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post('import')
  @HttpCode(200)
  importLeads(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(importLeadsSchema)) body: ImportLeadsInput) {
    return this.imports.import(tenant, body);
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
  findOne(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.leads.findOne(tenant, id);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/activities')
  addActivity(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addLeadActivitySchema)) body: AddLeadActivityInput,
  ) {
    return this.leads.addActivity(tenant, id, body);
  }

  /** A call, WhatsApp message or email sent from the app: logged, and counts as contact. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/contact')
  contact(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadContactSchema)) body: LeadContactInput,
  ) {
    return this.leads.contact(tenant, id, body);
  }

  /** Accept or decline the meeting a visitor asked for; the visitor is emailed. */
  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/meeting')
  respondToMeeting(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(meetingResponseSchema)) body: MeetingResponseInput,
  ) {
    return this.leads.respondToMeeting(tenant, id, body);
  }

  /** The meeting as a calendar file, to add to one's own calendar. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get(':id/meeting.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="meeting.ics"')
  meetingIcs(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.leads.meetingIcs(tenant, id);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { stageId?: string | null; temperature?: string; value?: number; name?: string | null; email?: string | null; phone?: string | null; company?: string | null },
  ) {
    return this.leads.update(tenant, id, body);
  }
}
