import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookService, type WebhookEvent } from '../webhook.service';

/** Webhooks Zapier made (or a person made for a Zap) are named so. */
export const ZAPIER_LABEL = 'Zapier';

/** The events a Zap can start from, and the lead intent each stands for. */
export const ZAPIER_EVENTS = ['lead.created', 'meeting.requested', 'quote.requested', 'contact.saved', 'card.viewed', 'nfc.tapped'] as const satisfies readonly WebhookEvent[];

/** A Zapier hook address: Zapier's own hosts only, so a key cannot aim deliveries elsewhere through this door. */
export function isZapierHook(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)zapier\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** A lead as the lead events carry it (LeadsService.emitLeadEvents). */
function leadSample(l: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  temperature: string;
  card: { slug: string } | null;
  createdAt: Date;
  activities?: { metadata: unknown }[];
}) {
  const meta = (l.activities?.[0]?.metadata ?? {}) as Record<string, unknown>;
  return {
    id: `sample_${l.id}`,
    event_created_at: l.createdAt.toISOString(),
    leadId: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    source: l.source,
    intent: typeof meta.intent === 'string' ? meta.intent : 'CONTACT',
    temperature: l.temperature,
    cardSlug: l.card?.slug ?? null,
    meetingAt: typeof meta.meetingAt === 'string' ? meta.meetingAt : null,
  };
}

/** What each event looks like before a workspace has any of its own. */
const EXAMPLES: Record<(typeof ZAPIER_EVENTS)[number], Record<string, unknown>> = {
  'lead.created': { leadId: 'cm_example_lead', name: 'Laila Hassan', email: 'laila@example.com', phone: '+201001234567', company: 'Nile Foods', source: 'card_form', intent: 'CONTACT', temperature: 'WARM', cardSlug: 'omar-saeed', meetingAt: null },
  'meeting.requested': { leadId: 'cm_example_lead', name: 'Laila Hassan', email: 'laila@example.com', phone: '+201001234567', company: 'Nile Foods', source: 'meeting', intent: 'MEETING', temperature: 'HOT', cardSlug: 'omar-saeed', meetingAt: '2026-10-08T08:00:00.000Z' },
  'quote.requested': { leadId: 'cm_example_lead', name: 'Laila Hassan', email: 'laila@example.com', phone: '+201001234567', company: 'Nile Foods', source: 'quote', intent: 'QUOTE', temperature: 'HOT', cardSlug: 'omar-saeed', meetingAt: null },
  'contact.saved': { cardId: 'cm_example_card', slug: 'omar-saeed', visitorId: 'visitor_example', referrer: null },
  'card.viewed': { cardId: 'cm_example_card', slug: 'omar-saeed', visitorId: 'visitor_example', referrer: null },
  'nfc.tapped': { tagId: 'cm_example_tag', uid: '04A2B3C4D5E6F7', cardId: 'cm_example_card', slug: 'omar-saeed' },
};

/**
 * What the Vertex Connect app in Zapier calls, with an API key: who the key
 * is for, subscribing a Zap to an event (a REST hook, delivered by the
 * signed webhooks), unsubscribing it, and samples to map fields from.
 */
@Injectable()
export class ZapierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Zapier's hosts, and outside production the addresses a test stands in
   * for Zapier at (ZAPIER_TEST_HOOK_ORIGINS, comma-separated).
   */
  private allowed(url: string): boolean {
    if (isZapierHook(url)) return true;
    if (!this.config || this.config.get<string>('NODE_ENV') === 'production') return false;
    const origins = (this.config.get<string>('ZAPIER_TEST_HOOK_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    return origins.some((o) => url.startsWith(o));
  }

  private get db() {
    return this.prisma.client;
  }

  private event(e: string): (typeof ZAPIER_EVENTS)[number] {
    if (!(ZAPIER_EVENTS as readonly string[]).includes(e)) throw new BadRequestException(`Zaps can start from: ${ZAPIER_EVENTS.join(', ')}`);
    return e as (typeof ZAPIER_EVENTS)[number];
  }

  /** Who the key is for: shown in Zapier as the connection's name. */
  async me(tenant: TenantContext) {
    const org = await this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { id: true, name: true, slug: true } });
    if (!org) throw new NotFoundException('Workspace not found');
    return { workspaceId: org.id, workspace: org.name, slug: org.slug };
  }

  /** Subscribes a Zap: deliveries of `event` go to its hook. */
  async subscribe(tenant: TenantContext, input: { hookUrl: string; event: string }) {
    const event = this.event(input.event);
    if (!this.allowed(input.hookUrl)) throw new BadRequestException('That is not a Zapier hook address');
    const created = await this.webhooks.create(tenant, { url: input.hookUrl, description: `${ZAPIER_LABEL}: ${event}`, events: [event] });
    // The signing secret is not needed by Zapier, and is not handed out here.
    return { id: created.id, event };
  }

  /** Unsubscribes a Zap (it was turned off or deleted). Only the workspace's Zapier hooks. */
  async unsubscribe(tenant: TenantContext, id: string) {
    const hook = await this.db.webhookEndpoint.findFirst({ where: { id, deletedAt: null, description: { startsWith: ZAPIER_LABEL } }, select: { id: true } });
    if (!hook) throw new NotFoundException('Zapier hook not found');
    return this.webhooks.remove(tenant, id);
  }

  /**
   * Sends a Zap an example of its event now, as a delivery would, so Zapier
   * has fields to map without waiting for a real one.
   */
  async test(tenant: TenantContext, id: string) {
    const hook = await this.db.webhookEndpoint.findFirst({ where: { id, deletedAt: null, description: { startsWith: ZAPIER_LABEL } }, select: { url: true, events: true } });
    if (!hook) throw new NotFoundException('Zapier hook not found');
    if (!this.allowed(hook.url)) throw new BadRequestException('That is not a Zapier hook address');
    const event = this.event(hook.events[0] ?? 'lead.created');
    const [sample] = await this.samples(tenant, event);
    const { id: sampleId, event_created_at, ...data } = sample as Record<string, unknown>;
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: sampleId, event, createdAt: event_created_at, test: true, data }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  /** The workspace's Zapier hooks, for its Integrations page. */
  async hooks() {
    const rows = await this.db.webhookEndpoint.findMany({
      where: { deletedAt: null, description: { startsWith: ZAPIER_LABEL } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, enabled: true, createdAt: true },
    });
    // The hook address is a secret of its own: only its end is shown.
    return rows.map((r) => ({ ...r, url: `…${r.url.slice(-8)}` }));
  }

  /**
   * Recent real examples of an event, shaped as its deliveries are, for
   * mapping fields when a Zap is built; a made-up one when there are none yet.
   */
  async samples(tenant: TenantContext, eventName: string) {
    const event = this.event(eventName);
    if (event === 'lead.created' || event === 'meeting.requested' || event === 'quote.requested') {
      const intent = event === 'meeting.requested' ? 'MEETING' : event === 'quote.requested' ? 'QUOTE' : null;
      const leads = await this.db.lead.findMany({
        where: intent ? { activities: { some: { metadata: { path: ['intent'], equals: intent } } } } : {},
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
          source: true,
          temperature: true,
          createdAt: true,
          card: { select: { slug: true } },
          activities: { where: { type: { in: ['NOTE', 'MEETING'] } }, orderBy: { createdAt: 'asc' }, take: 1, select: { metadata: true } },
        },
      });
      if (leads.length) return leads.map(leadSample);
    }
    return [{ id: `sample_${event}`, event_created_at: new Date().toISOString(), ...EXAMPLES[event] }];
  }
}

