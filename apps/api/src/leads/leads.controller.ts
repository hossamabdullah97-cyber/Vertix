import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
  editNoteSchema,
  type EditNoteInput,
  customFieldSchema,
  type CustomFieldInput,
  updateCustomFieldSchema,
  type UpdateCustomFieldInput,
  reorderCustomFieldsSchema,
  updateLeadSchema,
  type UpdateLeadInput,
} from '@vertex/shared';
import { LeadNotesService } from './lead-notes.service';
import { CustomFieldsService } from './custom-fields.service';
import { Roles } from '../auth/decorators/roles.decorator';
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
import { Area } from '../auth/decorators/area.decorator';

@Area('leads')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly merges: LeadMergeService,
    private readonly imports: LeadImportService,
    private readonly notes: LeadNotesService,
    private readonly fields: CustomFieldsService,
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

  /** The workspace's own lead fields, in order. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('fields')
  listFields() {
    return this.fields.list();
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('fields')
  createField(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(customFieldSchema)) body: CustomFieldInput) {
    return this.fields.create(tenant, body);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('fields/order')
  reorderFields(@Body(new ZodValidationPipe(reorderCustomFieldsSchema)) body: { ids: string[] }) {
    return this.fields.reorder(body.ids);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Patch('fields/:fieldId')
  updateField(@Param('fieldId') fieldId: string, @Body(new ZodValidationPipe(updateCustomFieldSchema)) body: UpdateCustomFieldInput) {
    return this.fields.update(fieldId, body);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Roles('OWNER', 'ADMIN')
  @Delete('fields/:fieldId')
  deleteField(@Tenant() tenant: TenantContext, @Param('fieldId') fieldId: string) {
    return this.fields.remove(tenant, fieldId);
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

  /** The team's notes on the leads the caller can see: all, naming them, or their own. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get('notes')
  teamNotes(@Tenant() tenant: TenantContext, @Query('filter') filter?: string) {
    return this.notes.feed(tenant, filter === 'mentions' || filter === 'mine' ? filter : 'all');
  }

  // Note: this dynamic route must stay AFTER the static 'stages' route above.
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get(':id')
  async findOne(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    const lead = await this.leads.findOne(tenant, id);
    // Who wrote each note or logged each call, by name.
    const by = (m: unknown) => (m && typeof m === 'object' ? (m as { by?: unknown }).by : undefined);
    const authors = await this.notes.authors(lead.activities.map((a) => by(a.metadata)));
    return { ...lead, activities: lead.activities.map((a) => ({ ...a, author: authors.get(by(a.metadata) as string) ?? null })) };
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Post(':id/activities')
  addActivity(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addLeadActivitySchema)) body: AddLeadActivityInput,
  ) {
    // A note keeps who wrote it and who it names.
    if (body.type === 'NOTE' && body.note?.trim()) return this.notes.add(tenant, id, body.note.trim(), body.mentions);
    return this.leads.addActivity(tenant, id, body);
  }

  /** The teammates a note on this lead can name with @. */
  @RequireScopes('crm:read')
  @UseGuards(RequireTenantGuard)
  @Get(':id/mentionable')
  mentionable(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.notes.mentionable(tenant, id);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Patch(':id/notes/:noteId')
  editNote(@Tenant() tenant: TenantContext, @Param('id') id: string, @Param('noteId') noteId: string, @Body(new ZodValidationPipe(editNoteSchema)) body: EditNoteInput) {
    return this.notes.edit(tenant, id, noteId, body);
  }

  @RequireScopes('crm:write')
  @UseGuards(RequireTenantGuard)
  @Delete(':id/notes/:noteId')
  deleteNote(@Tenant() tenant: TenantContext, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.notes.remove(tenant, id, noteId);
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
    @Body(new ZodValidationPipe(updateLeadSchema)) body: UpdateLeadInput,
  ) {
    return this.leads.update(tenant, id, body);
  }
}
