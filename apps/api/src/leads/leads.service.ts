import { BadRequestException, ConflictException, Injectable, Logger, Optional, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { buildIcs, googleCalendarLink, type CalendarEvent } from './ics';
import { meetingReplyEmail } from './meeting-mail';
import { ConfigService } from '@nestjs/config';
import type { AddLeadActivityInput, CreateLeadInput, LeadCaptureInput, LeadContactInput, MeetingResponseInput } from '@vertex/shared';
import { normalizeUid } from '@vertex/shared';
import type { Prisma, TenantContext } from '@vertex/db';
import { CardScanError, CardScanner } from './card-scan';
import { leadsVisibleTo } from './lead-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LeadAlertsService } from '../notifications/lead-alerts.service';
import { WebhookService } from '../integrations/webhook.service';
import { availabilityOf, isOpen } from '../cards/availability';
import { bookedMeetings } from '../cards/booked-meetings';
import { AuthThrottleService, tooManyAttempts } from '../auth/auth-throttle.service';
import { LIVE_ORG } from '../common/live-org';
import { CustomFieldsService } from './custom-fields.service';

/**
 * How many times an hour the public form may be sent: by one visitor to one
 * card (a person rarely needs more than a couple), by one visitor across all
 * cards, and to one card from everywhere (a flood spread over many addresses).
 *
 * A visitor is their phone (the id the card keeps on it). One address is
 * allowed far more: at an event the whole hall can reach the internet
 * through the venue's Wi-Fi as one address, and every visitor at the booth
 * shares it. Its limits only stop a script that makes up a new phone for
 * every send.
 */
export const CAPTURE_WINDOW_MS = 60 * 60_000;
export const CAPTURE_LIMITS = { visitorCard: 5, visitor: 20, addressCard: 60, address: 300, card: 200 } as const;

/** Paper cards one person may have read in an hour: a busy event day, not a script. */
export const SCAN_LIMIT = 60;
const SCAN_WINDOW_MS = 60 * 60_000;

/** How long the same details sent to the same card count as one lead (see capture). */
export const RESEND_WINDOW_MS = 10 * 60_000;

/** Logged activities that mean someone reached the lead (a note does not). */
const CONTACT_TYPES = new Set<string>(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING']);

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhookService,
    private readonly config: ConfigService,
    private readonly throttle: AuthThrottleService,
    private readonly alerts: LeadAlertsService,
    private readonly mail: MailService,
    @Optional() private readonly fields?: CustomFieldsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /**
   * Works out which chip, if any, brought this visitor in.
   *
   * The UID carried through the redirect is authoritative. When it is missing —
   * the visitor browsed elsewhere before filling the form, so the query string
   * was dropped — their own most recent scan of this card stands in. That
   * fallback is bounded to a day: crediting a chip for a form filled in a week
   * later would be a guess dressed up as data.
   *
   * Returns null rather than throwing: an unattributable lead is still a lead,
   * and this runs on a public endpoint where the UID is caller-supplied.
   */
  private async resolveTag(
    input: LeadCaptureInput,
    cardId: string,
    orgId: string,
  ): Promise<{ id: string } | null> {
    try {
      if (input.tagUid) {
        // Scoped to the card's own org, so a UID from elsewhere cannot be used
        // to credit another workspace's hardware.
        const byUid = await this.db.nfcTag.findFirst({
          where: { uid: normalizeUid(input.tagUid), orgId },
          select: { id: true },
        });
        if (byUid) return byUid;
      }

      if (!input.visitorId) return null;
      const visitor = await this.db.visitor.findFirst({
        where: { anonymousId: input.visitorId },
        select: { id: true },
      });
      if (!visitor) return null;

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const lastScan = await this.db.event.findFirst({
        where: {
          visitorId: visitor.id,
          cardId,
          type: 'NFC_SCAN',
          tagId: { not: null },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        select: { tagId: true },
      });
      return lastScan?.tagId ? { id: lastScan.tagId } : null;
    } catch (err) {
      this.logger.warn(`tag attribution failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Public lead capture from a card's exchange form. Runs without tenant
   * context, so orgId is resolved from the card and set explicitly.
   */
  async capture(input: LeadCaptureInput, ip = 'unknown') {
    // Limits first, so a flood costs one small query per request.
    // Without the phone's id (storage turned off), the address stands in for it.
    const device = input.visitorId?.trim().slice(0, 64);
    const visitor = device ? `phone:${device}` : `address:${ip}`;
    const keys: [string, number][] = [
      [`capture:${visitor}:${input.slug}`, CAPTURE_LIMITS.visitorCard],
      [`capture:${visitor}`, CAPTURE_LIMITS.visitor],
      ...(device
        ? ([
            [`capture:address:${ip}:${input.slug}`, CAPTURE_LIMITS.addressCard],
            [`capture:address:${ip}`, CAPTURE_LIMITS.address],
          ] as [string, number][])
        : []),
      [`capture-card:${input.slug}`, CAPTURE_LIMITS.card],
    ];
    for (const [key, limit] of keys) {
      const wait = await this.throttle.blockedFor(key, limit, CAPTURE_WINDOW_MS);
      if (wait > 0) throw tooManyAttempts(wait);
    }
    for (const [key] of keys) await this.throttle.hit(key, CAPTURE_WINDOW_MS);

    // Only a bot fills the hidden field. It is told all went well, so it has
    // nothing to learn from, and nothing is kept.
    if (input.website?.trim()) {
      this.logger.warn(`dropped a form filled by a bot on ${input.slug}`);
      return { ok: true as const, leadId: null };
    }

    const card = await this.db.card.findFirst({
      where: { slug: input.slug, isPublished: true, ...LIVE_ORG },
      select: { id: true, orgId: true, ownerId: true, theme: true, vcardData: true },
    });
    if (!card) throw new NotFoundException('Card not found');

    // The same details sent to the same card again within a few minutes are the
    // lead already made: a double tap, or a phone that kept the form while it
    // had no signal and sends it again when it may have arrived the first time.
    // Checked before the meeting time, which the first send has since taken.
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    if (email || phone) {
      const again = await this.db.lead.findFirst({
        where: {
          orgId: card.orgId,
          cardId: card.id,
          createdAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) },
          OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(phone ? [{ phone }] : [])],
        },
        select: { id: true },
      });
      if (again) return { ok: true as const, leadId: again.id };
    }

    // A meeting must be at one of the times the card offers and nobody took.
    let meetingAt: string | undefined;
    let meetingZone: string | undefined;
    if (input.intent === 'MEETING') {
      const now = new Date();
      const a = availabilityOf(card.theme, this.config.get<string>('DEFAULT_TIMEZONE'));
      if (!a.enabled) throw new BadRequestException('This card does not take meeting requests');
      if (!input.meetingAt) throw new BadRequestException('Choose a time for the meeting');
      if (!isOpen(a, now, await bookedMeetings(this.db, card.id, now), input.meetingAt)) {
        throw new ConflictException('That time is no longer free');
      }
      meetingAt = new Date(input.meetingAt).toISOString();
      meetingZone = a.timezone;
    }

    // Place the lead in the org's first pipeline stage, if any.
    const stage = await this.db.pipelineStage.findFirst({
      where: { orgId: card.orgId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const tag = await this.resolveTag(input, card.id, card.orgId);

    const intent = input.intent ?? 'CONTACT';
    // A lead that came off a chip says so, so the source reads as the channel it
    // actually arrived through rather than the form it was typed into.
    const source = tag
      ? 'nfc_scan'
      : intent === 'MEETING'
        ? 'meeting'
        : intent === 'QUOTE'
          ? 'quote'
          : 'card_form';
    // Meeting/quote requests signal higher intent → hotter lead.
    const temperature = intent === 'CONTACT' ? 'WARM' : 'HOT';

    const lead = await this.db.lead.create({
      data: {
        orgId: card.orgId,
        cardId: card.id,
        assignedTo: card.ownerId,
        stageId: stage?.id,
        tagId: tag?.id ?? null,
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
            meetingAt: meetingAt ?? null,
            // The zone the visitor picked the time in, so the owner reads the same time.
            ...(meetingZone ? { timezone: meetingZone } : {}),
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
      // The meeting's time and zone, so the notification can say when without opening the lead.
      metadata: { leadId: lead.id, source, intent, ...(meetingAt ? { meetingAt, timezone: meetingZone } : {}) },
    });

    // And by email / WhatsApp, as the owner chose. Not awaited: the visitor
    // should not wait on a mail provider.
    const vcard = (card.vcardData ?? {}) as Record<string, unknown>;
    void this.alerts.leadCaptured(card.ownerId, {
      leadId: lead.id,
      orgId: card.orgId,
      intent,
      name: input.name,
      email: input.email || null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      note: input.note ?? null,
      meetingAt: meetingAt ?? null,
      timezone: availabilityOf(card.theme, this.config.get<string>('DEFAULT_TIMEZONE')).timezone,
      cardName: (typeof vcard.fullName === 'string' && vcard.fullName.trim()) || input.slug,
      lang: (card.theme as { lang?: unknown } | null)?.lang === 'ar' ? 'ar' : 'en',
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
      meetingAt: meetingAt ?? null,
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

  visibleTo(viewer: TenantContext): Prisma.LeadWhereInput {
    return leadsVisibleTo(viewer);
  }

  /** The org's leads this person may see (orgId auto-injected), newest first. */
  list(viewer: TenantContext) {
    return this.db.lead.findMany({
      where: this.visibleTo(viewer),
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
        assignedTo: true,
        firstContactedAt: true,
        lastContactedAt: true,
        createdAt: true,
        customFields: true,
        card: { select: { slug: true } },
      },
    });
  }

  /** Full lead detail with its activity history (org-scoped, newest first). */
  async findOne(viewer: TenantContext, id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, ...this.visibleTo(viewer) },
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
        assignedTo: true,
        firstContactedAt: true,
        lastContactedAt: true,
        createdAt: true,
        customFields: true,
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
  async addActivity(viewer: TenantContext, id: string, input: AddLeadActivityInput) {
    const lead = await this.db.lead.findFirst({ where: { id, ...this.visibleTo(viewer) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const activity = await this.db.leadActivity.create({
      data: {
        leadId: id,
        type: input.type,
        metadata: { note: input.note ?? null, meetingAt: input.meetingAt ?? null, manual: true, by: viewer.userId },
      },
      select: { id: true, type: true, metadata: true, createdAt: true },
    });
    if (CONTACT_TYPES.has(input.type)) await this.markContacted(id, activity.createdAt);
    return activity;
  }

  /**
   * Reaching out from the app (a call placed, a WhatsApp message or email
   * opened ready to send): logged on the lead with what was sent, and it is
   * the contact the follow-up reminders wait for.
   */
  async contact(viewer: TenantContext, id: string, input: LeadContactInput) {
    const lead = await this.db.lead.findFirst({ where: { id, ...this.visibleTo(viewer) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const activity = await this.db.leadActivity.create({
      data: {
        leadId: id,
        type: input.channel,
        metadata: {
          note: input.note?.trim() || null,
          ...(input.subject ? { subject: input.subject } : {}),
          ...(input.templateId ? { templateId: input.templateId } : {}),
          by: viewer.userId,
          manual: true,
        },
      },
      select: { id: true, type: true, metadata: true, createdAt: true },
    });
    const times = await this.markContacted(id, activity.createdAt);
    return { activity, ...times };
  }

  /** Records that someone reached out at `at`: the first time once, the last time always. */
  private async markContacted(id: string, at: Date) {
    await this.db.lead.updateMany({ where: { id, firstContactedAt: null }, data: { firstContactedAt: at } });
    return this.db.lead.update({ where: { id }, data: { lastContactedAt: at }, select: { firstContactedAt: true, lastContactedAt: true } });
  }

  /**
   * The meeting a visitor asked for through a card's form, with what is
   * needed to answer it. Owner-logged meetings are notes, not requests.
   */
  private async meetingRequest(viewer: TenantContext, id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, ...this.visibleTo(viewer) },
      select: {
        id: true,
        name: true,
        email: true,
        cardId: true,
        card: { select: { slug: true, theme: true, vcardData: true, owner: { select: { email: true, name: true } } } },
        activities: {
          where: { type: 'MEETING' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, metadata: true, createdAt: true },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    const request = lead.activities.find((a) => {
      const m = (a.metadata ?? {}) as Record<string, unknown>;
      return typeof m.meetingAt === 'string' && !m.manual;
    });
    if (!request || !lead.card || !lead.cardId) throw new NotFoundException('This lead has no meeting request');
    const meta = (request.metadata ?? {}) as Record<string, unknown>;
    const theme = (lead.card.theme ?? {}) as Record<string, unknown>;
    const vcard = (lead.card.vcardData ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const availability = availabilityOf(lead.card.theme, this.config.get<string>('DEFAULT_TIMEZONE'));
    const base = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const ownerName = str(vcard.fullName) ?? lead.card.owner.name ?? lead.card.slug;
    return {
      lead,
      request,
      meta,
      cardId: lead.cardId,
      at: new Date(meta.meetingAt as string),
      minutes: availability.length,
      timezone: availability.timezone,
      lang: (theme.lang === 'ar' ? 'ar' : 'en') as 'en' | 'ar',
      ownerName,
      ownerLine: [str(vcard.title), str(vcard.company)].filter(Boolean).join(' · ') || null,
      ownerEmail: str(vcard.email) ?? lead.card.owner.email,
      cardUrl: `${base}/c/${lead.card.slug}`,
    };
  }

  private meetingEvent(m: Awaited<ReturnType<LeadsService['meetingRequest']>>): CalendarEvent {
    const visitor = m.lead.name || m.lead.email || 'Visitor';
    return {
      uid: `${m.request.id}@vertex-connect`,
      start: m.at,
      minutes: m.minutes,
      title: `${visitor} · ${m.ownerName}`,
      description: typeof m.meta.note === 'string' && m.meta.note.trim() ? m.meta.note.trim() : undefined,
      url: m.cardUrl,
      organizer: { name: m.ownerName, email: m.ownerEmail },
      attendee: { name: visitor, email: m.lead.email },
    };
  }

  /**
   * Accepts or declines a visitor's meeting request and tells the visitor by
   * email, with a calendar invite when accepted. A declined time is free to
   * book again. Changing one's mind is allowed; taking back a time someone
   * else has since asked for is not.
   */
  async respondToMeeting(viewer: TenantContext, id: string, input: MeetingResponseInput) {
    const userId = viewer.userId;
    const m = await this.meetingRequest(viewer, id);
    const status = input.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    if (m.meta.status === status) throw new ConflictException(status === 'ACCEPTED' ? 'Already accepted' : 'Already declined');
    if (status === 'ACCEPTED') {
      if (m.at.getTime() < Date.now()) throw new BadRequestException('This meeting time has passed');
      const others = await this.db.leadActivity.findMany({
        where: { type: 'MEETING', id: { not: m.request.id }, lead: { cardId: m.cardId, deletedAt: null } },
        select: { metadata: true },
      });
      const taken = others.some((o) => {
        const meta = (o.metadata ?? {}) as Record<string, unknown>;
        return meta.status !== 'DECLINED' && typeof meta.meetingAt === 'string' && new Date(meta.meetingAt).getTime() === m.at.getTime();
      });
      if (taken) throw new ConflictException('Someone else has asked for this time since');
    }

    const metadata = {
      ...m.meta,
      status,
      decidedAt: new Date().toISOString(),
      decidedBy: userId,
      reply: input.message?.trim() || null,
    };
    const activity = await this.db.leadActivity.update({
      where: { id: m.request.id },
      data: { metadata },
      select: { id: true, type: true, metadata: true, createdAt: true },
    });

    let emailed = false;
    if (m.lead.email) {
      const event = this.meetingEvent(m);
      const { subject, html } = meetingReplyEmail(
        {
          decision: status,
          visitorName: m.lead.name || m.lead.email,
          ownerName: m.ownerName,
          ownerLine: m.ownerLine,
          meetingAt: m.at,
          minutes: m.minutes,
          timezone: m.timezone,
          message: input.message,
          cardUrl: m.cardUrl,
          calendarUrl: status === 'ACCEPTED' ? googleCalendarLink(event) : undefined,
        },
        m.lang,
      );
      emailed = await this.mail.send({
        to: m.lead.email,
        subject,
        html,
        replyTo: m.ownerEmail ?? undefined,
        attachments: status === 'ACCEPTED' ? [{ filename: 'meeting.ics', content: buildIcs(event), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }] : undefined,
      });
    }

    // Answering the request is reaching out.
    await this.markContacted(id, new Date());
    return { activity, emailed };
  }

  /** The accepted (or asked-for) meeting as a calendar file, for the owner. */
  async meetingIcs(viewer: TenantContext, id: string): Promise<string> {
    return buildIcs(this.meetingEvent(await this.meetingRequest(viewer, id)));
  }

  private scanner(): CardScanner | null {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    return key ? new CardScanner(key, this.config.get<string>('LEAD_SCAN_MODEL') || 'claude-haiku-4-5-20251001') : null;
  }

  /** Whether this server can read paper cards. */
  scanAvailable() {
    return { available: !!this.config.get<string>('ANTHROPIC_API_KEY') };
  }

  /**
   * Reads the contact from a photo of a paper business card. Nothing is saved:
   * the person checks what was read, then adds the lead with create().
   */
  async scanCard(userId: string, image: { mediaType: string; base64: string }) {
    const scanner = this.scanner();
    if (!scanner) throw new ServiceUnavailableException('Card scanning is not set up on this server');
    const key = `card-scan:${userId}`;
    const wait = await this.throttle.blockedFor(key, SCAN_LIMIT, SCAN_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);
    await this.throttle.hit(key, SCAN_WINDOW_MS);
    try {
      return await scanner.read(image);
    } catch (err) {
      if (err instanceof CardScanError) {
        this.logger.warn(`card scan: ${err.message}`);
        if (err.kind === 'not-a-card') throw new UnprocessableEntityException('No business card found in the photo');
        throw new ServiceUnavailableException('The card could not be read right now');
      }
      throw err;
    }
  }

  /** A lead someone adds themselves (typed, or read from a paper card), assigned to them. */
  async create(tenant: TenantContext, input: CreateLeadInput) {
    const stage = await this.db.pipelineStage.findFirst({ orderBy: { order: 'asc' }, select: { id: true } });
    const lead = await this.db.lead.create({
      data: {
        orgId: tenant.orgId,
        assignedTo: tenant.userId,
        stageId: stage?.id,
        name: input.name || undefined,
        email: input.email || undefined,
        phone: input.phone || undefined,
        company: input.company || undefined,
        source: input.source,
        temperature: 'WARM',
      },
      select: { id: true, name: true, email: true, phone: true, company: true, score: true, value: true, temperature: true, source: true, stageId: true, createdAt: true, card: { select: { slug: true } } },
    });
    // What the lead record has no column for is kept as its first note.
    const lines = [
      input.title && `${input.title}`,
      input.website && `${input.website}`,
      input.address && `${input.address}`,
      input.note && `${input.note}`,
    ].filter(Boolean);
    if (lines.length) {
      await this.db.leadActivity.create({
        data: { leadId: lead.id, type: 'NOTE', metadata: { note: lines.join('\n'), title: input.title ?? null, website: input.website ?? null, address: input.address ?? null, source: input.source } },
      });
    }
    void this.webhooks.emit(tenant.orgId, 'lead.created', { leadId: lead.id, name: lead.name, email: lead.email, phone: lead.phone, company: lead.company, source: input.source }).catch(() => undefined);
    return lead;
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
    viewer: TenantContext,
    id: string,
    input: {
      stageId?: string | null;
      temperature?: string;
      value?: number;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      company?: string | null;
      /** The workspace's own fields, by field id; an empty value clears one. */
      customFields?: Record<string, unknown>;
    },
  ) {
    const lead = await this.db.lead.findFirst({ where: { id, ...this.visibleTo(viewer) }, select: { id: true, stageId: true, orgId: true, customFields: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const customFields =
      input.customFields && typeof input.customFields === 'object' && !Array.isArray(input.customFields) && this.fields
        ? await this.fields.apply(lead.customFields, input.customFields)
        : undefined;

    // A caller-supplied stageId must belong to the active org's pipeline —
    // otherwise a lead could be parked in another tenant's stage.
    if (input.stageId) {
      const stage = await this.db.pipelineStage.findFirst({
        where: { id: input.stageId },
        select: { id: true },
      });
      if (!stage) throw new NotFoundException('Pipeline stage not found');
    }

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
        ...(customFields !== undefined ? { customFields } : {}),
      },
      select: { id: true, stageId: true, temperature: true, value: true, name: true, email: true, phone: true, company: true, customFields: true },
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
