import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AddLeadActivityInput, LeadCaptureInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhookService } from '../integrations/webhook.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhookService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /**
   * Public lead capture from a card's exchange form. Runs without tenant
   * context, so orgId is resolved from the card and set explicitly.
   */
  async capture(input: LeadCaptureInput) {
    const card = await this.db.card.findFirst({
      where: { slug: input.slug, isPublished: true },
      select: { id: true, orgId: true, ownerId: true },
    });
    if (!card) throw new NotFoundException('Card not found');

    // Place the lead in the org's first pipeline stage, if any.
    const stage = await this.db.pipelineStage.findFirst({
      where: { orgId: card.orgId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const intent = input.intent ?? 'CONTACT';
    const source =
      intent === 'MEETING' ? 'meeting' : intent === 'QUOTE' ? 'quote' : 'card_form';
    // Meeting/quote requests signal higher intent → hotter lead.
    const temperature = intent === 'CONTACT' ? 'WARM' : 'HOT';

    const lead = await this.db.lead.create({
      data: {
        orgId: card.orgId,
        cardId: card.id,
        assignedTo: card.ownerId,
        stageId: stage?.id,
        name: input.name,
        email: input.email || undefined,
        phone: input.phone,
        company: input.company,
        source,
        temperature,
      },
      select: { id: true },
    });

    // Activity log captures the intent + any meeting time / note (best-effort).
    try {
      await this.db.leadActivity.create({
        data: {
          leadId: lead.id,
          type: intent === 'MEETING' ? 'MEETING' : 'NOTE',
          metadata: {
            intent,
            note: input.note ?? null,
            meetingAt: input.meetingAt ?? null,
          },
        },
      });
    } catch (err) {
      this.logger.warn(`lead activity failed: ${(err as Error).message}`);
    }

    // Notify the card owner of the new lead (public capture → no actor).
    await this.notifications.notify({
      userId: card.ownerId,
      orgId: card.orgId,
      type: 'lead.captured',
      category: 'CRM',
      priority: intent === 'CONTACT' ? 'MEDIUM' : 'HIGH',
      title: 'New lead captured',
      body: `${input.name}${input.company ? ` · ${input.company}` : ''}`,
      metadata: { leadId: lead.id, source, intent },
    });

    // Fan the event out to any subscribed external systems (Slack, Zapier,
    // CRM, …). Best-effort and non-blocking — a webhook problem must never
    // fail the visitor's capture. Delivery itself is queued and retried.
    const eventData = {
      leadId: lead.id,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      source,
      intent,
      temperature,
      cardSlug: input.slug,
    };
    void this.emitLeadEvents(card.orgId, intent, eventData);

    return { ok: true as const, leadId: lead.id };
  }

  /** Emits the capture events an integration may subscribe to (best-effort). */
  private async emitLeadEvents(
    orgId: string,
    intent: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.webhooks.emit(orgId, 'lead.created', data);
      if (intent === 'MEETING') await this.webhooks.emit(orgId, 'meeting.requested', data);
      if (intent === 'QUOTE') await this.webhooks.emit(orgId, 'quote.requested', data);
    } catch (err) {
      this.logger.warn(`webhook emit failed: ${(err as Error).message}`);
    }
  }

  /** Org-scoped lead list (orgId auto-injected). */
  list() {
    return this.db.lead.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        score: true,
        value: true,
        temperature: true,
        source: true,
        stageId: true,
        createdAt: true,
        card: { select: { slug: true } },
      },
    });
  }

  /** Full lead detail with its activity history (org-scoped, newest first). */
  async findOne(id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        score: true,
        value: true,
        temperature: true,
        source: true,
        stageId: true,
        createdAt: true,
        card: { select: { slug: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true, metadata: true, createdAt: true },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  /** Append a user-logged activity (note / call / email / meeting) to a lead. */
  async addActivity(id: string, input: AddLeadActivityInput) {
    const lead = await this.db.lead.findFirst({ where: { id }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.db.leadActivity.create({
      data: {
        leadId: id,
        type: input.type,
        metadata: { note: input.note ?? null, meetingAt: input.meetingAt ?? null, manual: true },
      },
      select: { id: true, type: true, metadata: true, createdAt: true },
    });
  }

  /** The org's pipeline stages (ordered). */
  listStages() {
    return this.db.pipelineStage.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true, color: true },
    });
  }

  /** Move a lead across the pipeline / update its temperature. */
  async update(
    id: string,
    input: { stageId?: string | null; temperature?: string; value?: number; name?: string | null; email?: string | null; phone?: string | null; company?: string | null },
  ) {
    const lead = await this.db.lead.findFirst({ where: { id }, select: { id: true, stageId: true, orgId: true } });
    if (!lead) throw new NotFoundException('Lead not found');

    const updated = await this.db.lead.update({
      where: { id },
      data: {
        ...(input.stageId !== undefined ? { stageId: input.stageId } : {}),
        ...(input.temperature ? { temperature: input.temperature as never } : {}),
        ...(typeof input.value === 'number' ? { value: Math.max(0, Math.round(input.value)) } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.company !== undefined ? { company: input.company } : {}),
      },
      select: { id: true, stageId: true, temperature: true, value: true, name: true, email: true, phone: true, company: true },
    });

    // Record a STAGE_CHANGE activity so the timeline reflects real movement.
    if (input.stageId !== undefined && input.stageId !== lead.stageId) {
      try {
        await this.db.leadActivity.create({
          data: {
            leadId: id,
            type: 'STAGE_CHANGE',
            metadata: { from: lead.stageId ?? null, to: input.stageId ?? null },
          },
        });
      } catch (err) {
        this.logger.warn(`stage-change activity failed: ${(err as Error).message}`);
      }
    }

    // Notify subscribed integrations of the change (best-effort).
    void this.webhooks
      .emit(lead.orgId, 'lead.updated', {
        leadId: updated.id,
        stageId: updated.stageId,
        stageChanged: input.stageId !== undefined && input.stageId !== lead.stageId,
        temperature: updated.temperature,
        value: updated.value,
        name: updated.name,
        company: updated.company,
      })
      .catch(() => undefined);

    return updated;
  }
}
