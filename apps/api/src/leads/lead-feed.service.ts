import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { LeadNotesService } from './lead-notes.service';
import { leadsVisibleTo, tasksVisibleTo } from './lead-visibility';
import { cardLabel } from './lead-timeline.service';

/** Opening a card again within this long of leaving one's details is the same visit. */
const SAME_VISIT_MS = 30 * 60 * 1000;
const CONVERSATIONS = ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING'] as const;
/** The leads whose visits are looked for, newest first: plenty for any one page of the feed. */
const MAX_VISITORS = 5000;

export const FEED_KINDS = ['all', 'conversations', 'notes', 'visits', 'tasks', 'changes'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

type LeadRef = { id: string; name: string | null; company: string | null };
type Person = { id: string; name: string; avatarUrl: string | null };

export type FeedItem =
  | { kind: 'activity'; id: string; at: string; lead: LeadRef; type: string; metadata: unknown; author: Person | null }
  | { kind: 'captured'; id: string; at: string; lead: LeadRef; source: string | null; card: string | null }
  | { kind: 'returned'; id: string; at: string; lead: LeadRef; card: string | null }
  | { kind: 'task'; id: string; at: string; lead: LeadRef; title: string; by: Person | null };

/** The note a card's form leaves when nothing was written: the capture says it already. */
function bareCapture(type: string, metadata: unknown): boolean {
  const m = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  return type === 'NOTE' && m.manual !== true && !m.by && !(typeof m.note === 'string' && m.note.trim());
}

/**
 * What happened across the workspace's leads, newest first, a page at a time:
 * conversations and notes, pipeline moves, new leads, leads coming back to a
 * card and tasks done. Only the leads the reader may see.
 */
@Injectable()
export class LeadFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: LeadNotesService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async feed(viewer: TenantContext, opts: { before?: Date; limit?: number; kind?: FeedKind } = {}): Promise<{ items: FeedItem[]; next: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
    const kind = opts.kind ?? 'all';
    // Inclusive, so things at the same moment as the last of a page are not lost; the reader drops repeats.
    const at = opts.before ? { lte: opts.before } : undefined;
    const visible = { orgId: viewer.orgId, deletedAt: null, ...leadsVisibleTo(viewer) };
    const leadRef = { select: { id: true, name: true, company: true } } as const;
    const wants = (k: FeedKind) => kind === 'all' || kind === k;

    const activityTypes =
      kind === 'conversations' ? [...CONVERSATIONS] : kind === 'notes' ? ['NOTE'] : kind === 'changes' ? ['STAGE_CHANGE', 'SCORE_CHANGE', 'MERGE', 'SCAN'] : undefined;
    const [activities, captured, tasks, returned] = await Promise.all([
      wants('conversations') || wants('notes') || wants('changes')
        ? this.db.leadActivity.findMany({
            // A related filter is not scoped by the tenant extension: the workspace is named here.
            where: { lead: visible, ...(at ? { createdAt: at } : {}), ...(activityTypes ? { type: { in: activityTypes as never } } : {}) },
            orderBy: { createdAt: 'desc' },
            // Room for the empty capture notes that are left out.
            take: limit * 2,
            select: { id: true, type: true, metadata: true, createdAt: true, lead: leadRef },
          })
        : [],
      wants('changes')
        ? this.db.lead.findMany({
            where: { ...leadsVisibleTo(viewer), ...(at ? { createdAt: at } : {}) },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, name: true, company: true, source: true, createdAt: true, card: { select: { slug: true, vcardData: true } } },
          })
        : [],
      wants('tasks')
        ? this.db.task.findMany({
            where: { ...tasksVisibleTo(viewer), completed: true, leadId: { not: null }, lead: visible, ...(at ? { completedAt: at } : { completedAt: { not: null } }) },
            orderBy: { completedAt: 'desc' },
            take: limit,
            select: { id: true, title: true, completedAt: true, assignedTo: true, lead: leadRef },
          })
        : [],
      wants('visits') ? this.returns(viewer, at, limit) : [],
    ]);

    const people = await this.notes.authors([
      ...activities.map((a) => (a.metadata && typeof a.metadata === 'object' ? (a.metadata as { by?: unknown }).by : undefined)),
      ...tasks.map((t) => t.assignedTo),
    ]);
    const person = (id: unknown) => (typeof id === 'string' ? people.get(id) ?? null : null);

    const items: FeedItem[] = [
      ...activities
        .filter((a) => !bareCapture(a.type, a.metadata))
        .map((a) => ({
          kind: 'activity' as const,
          id: a.id,
          at: a.createdAt.toISOString(),
          lead: a.lead,
          type: a.type,
          metadata: a.metadata,
          author: person((a.metadata as { by?: unknown } | null)?.by),
        })),
      ...captured.map((l) => ({
        kind: 'captured' as const,
        id: `created-${l.id}`,
        at: l.createdAt.toISOString(),
        lead: { id: l.id, name: l.name, company: l.company },
        source: l.source,
        card: l.card ? cardLabel(l.card) : null,
      })),
      ...tasks.map((t) => ({ kind: 'task' as const, id: `task-done-${t.id}`, at: t.completedAt!.toISOString(), lead: t.lead!, title: t.title, by: person(t.assignedTo) })),
      ...returned,
    ];
    items.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
    const page = items.slice(0, limit);
    // Another page may follow while any source filled its share.
    const full = activities.length >= limit * 2 || captured.length >= limit || tasks.length >= limit || returned.length >= limit || items.length > limit;
    return { items: page, next: full && page.length ? page[page.length - 1]!.at : null };
  }

  /** Visits to a card by leads who had already left their details. */
  private async returns(viewer: TenantContext, at: { lte: Date } | undefined, limit: number): Promise<FeedItem[]> {
    const leads = await this.db.lead.findMany({
      where: { ...leadsVisibleTo(viewer), visitorId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: MAX_VISITORS,
      select: { id: true, name: true, company: true, visitorId: true, createdAt: true },
    });
    if (!leads.length) return [];
    const byVisitor = new Map<string, typeof leads>();
    for (const l of leads) byVisitor.set(l.visitorId!, [...(byVisitor.get(l.visitorId!) ?? []), l]);
    const views = await this.db.event.findMany({
      where: { type: 'VIEW', visitorId: { in: [...byVisitor.keys()] }, ...(at ? { createdAt: at } : {}) },
      orderBy: { createdAt: 'desc' },
      // The visit a lead left their details on is not a return: room to skip those.
      take: limit * 2,
      select: { id: true, visitorId: true, createdAt: true, card: { select: { slug: true, vcardData: true } } },
    });
    const out: FeedItem[] = [];
    for (const v of views) {
      for (const l of byVisitor.get(v.visitorId!) ?? []) {
        if (v.createdAt.getTime() - l.createdAt.getTime() < SAME_VISIT_MS) continue;
        out.push({ kind: 'returned', id: `visit-${v.id}-${l.id}`, at: v.createdAt.toISOString(), lead: { id: l.id, name: l.name, company: l.company }, card: v.card ? cardLabel(v.card) : null });
      }
    }
    return out.slice(0, limit);
  }
}
