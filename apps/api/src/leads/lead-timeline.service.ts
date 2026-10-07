import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { LeadNotesService } from './lead-notes.service';
import { leadsVisibleTo } from './lead-visibility';

/** A pause this long between two things a visitor did on a card starts a new visit. */
export const VISIT_GAP_MS = 30 * 60 * 1000;
/** The card events looked at: a lifetime of visits for anyone, without reading a firehose. */
const MAX_EVENTS = 2000;
/** Reaching out, as opposed to writing something down. */
const CONTACTS = new Set(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING']);

type Person = { id: string; name: string; avatarUrl: string | null };

export type VisitAction = { type: 'CLICK' | 'SAVE' | 'SHARE'; at: string; action?: string; platform?: string };

export type TimelineItem =
  | { kind: 'created'; id: string; at: string; source: string | null; card: { id: string; name: string } | null; tag: string | null }
  | { kind: 'activity'; id: string; at: string; type: string; metadata: unknown; author: Person | null }
  | { kind: 'task'; id: string; at: string; event: 'created' | 'completed'; title: string; dueDate: string | null; completed: boolean; assignee: Person | null }
  | {
      kind: 'visit';
      id: string;
      at: string;
      endedAt: string;
      card: { id: string; name: string } | null;
      /** After they had left their details: they came back. */
      returning: boolean;
      /** Opened from a chip (a tap) rather than a link. */
      tapped: boolean;
      actions: VisitAction[];
    };

export type TimelineSummary = {
  visits: number;
  returns: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  contacts: number;
  lastContactAt: string | null;
  notes: number;
  openTasks: number;
  overdueTasks: number;
};

type EventRow = { id: string; type: string; cardId: string | null; tagId: string | null; metadata: unknown; createdAt: Date };

/**
 * Groups a visitor's card events into visits: an opening (a view or a tap)
 * with what they did there, until they had been away half an hour or opened
 * another card. Events come oldest first.
 */
export function groupVisits(events: EventRow[], leadCreatedAt: Date, cardName: (id: string | null) => { id: string; name: string } | null) {
  const visits: Extract<TimelineItem, { kind: 'visit' }>[] = [];
  let current: (typeof visits)[number] | null = null;
  let last = 0;
  for (const e of events) {
    const t = e.createdAt.getTime();
    // A tap and the view it opens, and whatever follows on the same card
    // without a half-hour pause, are one visit.
    const continues = !!current && (current.card?.id ?? null) === (cardName(e.cardId)?.id ?? null) && t - last < VISIT_GAP_MS;
    if (!current || !continues) {
      current = {
        kind: 'visit',
        id: `visit-${e.id}`,
        at: e.createdAt.toISOString(),
        endedAt: e.createdAt.toISOString(),
        card: cardName(e.cardId),
        returning: t > leadCreatedAt.getTime(),
        tapped: e.type === 'NFC_SCAN' || !!e.tagId,
        actions: [],
      };
      visits.push(current);
    } else {
      current.endedAt = e.createdAt.toISOString();
      if (e.type === 'NFC_SCAN' || e.tagId) current.tapped = true;
    }
    if (e.type === 'CLICK' || e.type === 'SAVE' || e.type === 'SHARE') {
      const m = (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>;
      current.actions.push({
        type: e.type,
        at: e.createdAt.toISOString(),
        ...(typeof m.type === 'string' ? { action: m.type } : {}),
        ...(typeof m.platform === 'string' ? { platform: m.platform } : {}),
      });
    }
    last = t;
  }
  return visits;
}

/**
 * Everything that happened with one lead, in one place: their visits to the
 * card (before and after they left their details), the conversations and
 * notes, the tasks, and how they moved through the pipeline.
 */
@Injectable()
export class LeadTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: LeadNotesService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async timeline(viewer: TenantContext, id: string): Promise<{ items: TimelineItem[]; summary: TimelineSummary }> {
    const lead = await this.db.lead.findFirst({
      where: { id, ...leadsVisibleTo(viewer) },
      select: {
        id: true,
        createdAt: true,
        source: true,
        visitorId: true,
        cardId: true,
        tag: { select: { uid: true, hardwareType: true } },
        activities: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, metadata: true, createdAt: true } },
        tasks: {
          where: { deletedAt: null },
          select: { id: true, title: true, dueDate: true, completed: true, completedAt: true, createdAt: true, assignedTo: true },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const events: EventRow[] = lead.visitorId
      ? (
          await this.db.event.findMany({
            where: { visitorId: lead.visitorId },
            orderBy: { createdAt: 'desc' },
            take: MAX_EVENTS,
            select: { id: true, type: true, cardId: true, tagId: true, metadata: true, createdAt: true },
          })
        ).reverse()
      : [];

    const cardIds = [...new Set([lead.cardId, ...events.map((e) => e.cardId)].filter((v): v is string => !!v))];
    const cards = cardIds.length
      ? await this.db.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, slug: true, vcardData: true } })
      : [];
    const names = new Map(cards.map((c) => [c.id, cardLabel(c)]));
    const cardName = (cid: string | null) => (cid && names.has(cid) ? { id: cid, name: names.get(cid)! } : null);

    const by = (m: unknown) => (m && typeof m === 'object' ? (m as { by?: unknown }).by : undefined);
    const people = await this.notes.authors([...lead.activities.map((a) => by(a.metadata)), ...lead.tasks.map((t) => t.assignedTo)]);
    const person = (uid: unknown) => (typeof uid === 'string' ? people.get(uid) ?? null : null);

    const visits = groupVisits(events, lead.createdAt, cardName);
    const items: TimelineItem[] = [
      { kind: 'created', id: `created-${lead.id}`, at: lead.createdAt.toISOString(), source: lead.source, card: cardName(lead.cardId), tag: lead.tag ? lead.tag.hardwareType : null },
      ...lead.activities.map((a) => ({ kind: 'activity' as const, id: a.id, at: a.createdAt.toISOString(), type: a.type, metadata: a.metadata, author: person(by(a.metadata)) })),
      ...lead.tasks.flatMap((t) => {
        const base = { title: t.title, dueDate: t.dueDate?.toISOString() ?? null, completed: t.completed, assignee: person(t.assignedTo) };
        const out: TimelineItem[] = [{ kind: 'task', id: `task-${t.id}`, at: t.createdAt.toISOString(), event: 'created', ...base }];
        if (t.completed && t.completedAt) out.push({ kind: 'task', id: `task-done-${t.id}`, at: t.completedAt.toISOString(), event: 'completed', ...base });
        return out;
      }),
      ...visits,
    ];
    // Newest first; at the same moment, the lead's creation reads last.
    items.sort((a, b) => b.at.localeCompare(a.at) || (a.kind === 'created' ? 1 : b.kind === 'created' ? -1 : 0));

    const contacts = lead.activities.filter((a) => CONTACTS.has(a.type));
    const now = Date.now();
    const open = lead.tasks.filter((t) => !t.completed);
    return {
      items,
      summary: {
        visits: visits.length,
        returns: visits.filter((v) => v.returning).length,
        firstVisitAt: visits[0]?.at ?? null,
        lastVisitAt: visits[visits.length - 1]?.at ?? null,
        contacts: contacts.length,
        lastContactAt: contacts[0]?.createdAt.toISOString() ?? null,
        notes: lead.activities.filter((a) => a.type === 'NOTE').length,
        openTasks: open.length,
        overdueTasks: open.filter((t) => t.dueDate && t.dueDate.getTime() < now).length,
      },
    };
  }
}

/** The name a card goes by: the person on it, else its address. */
export function cardLabel(c: { slug: string; vcardData: unknown }): string {
  const v = (c.vcardData && typeof c.vcardData === 'object' ? c.vcardData : {}) as Record<string, unknown>;
  const name = [v.fullName, v.name, [v.firstName, v.lastName].filter(Boolean).join(' ')].find((x) => typeof x === 'string' && x.trim());
  return typeof name === 'string' ? name.trim() : c.slug;
}
