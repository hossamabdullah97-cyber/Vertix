import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TenantContext } from '@vertex/db';
import type { EditNoteInput, Mentionable, TeamNote } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { leadsVisibleTo } from './lead-visibility';

type Meta = Record<string, unknown>;
type Mention = { id: string; name: string };

const metaOf = (m: unknown): Meta => (m && typeof m === 'object' && !Array.isArray(m) ? (m as Meta) : {});

/** A short excerpt of a note for a notification: one line, at most 140 characters. */
export function excerpt(note: string): string {
  const line = note.replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

/**
 * Notes on leads, written by the team: who wrote them, the teammates they
 * name with @ (each told, and only those who can see the lead), editing and
 * deleting one's own, and the team's notes in one feed.
 */
@Injectable()
export class LeadNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private async visibleLead(viewer: TenantContext, id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, ...leadsVisibleTo(viewer) },
      select: { id: true, name: true, company: true, assignedTo: true, card: { select: { ownerId: true } } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  /**
   * The teammates a note on this lead can name: those who can open it.
   * Managers and above see every lead; a member, the leads assigned to them
   * and those their cards brought in.
   */
  async mentionable(viewer: TenantContext, leadId: string): Promise<Mentionable[]> {
    const lead = await this.visibleLead(viewer, leadId);
    // Not the writer: nobody needs telling about their own note.
    return (await this.canSee(lead)).filter((m) => m.id !== viewer.userId);
  }

  private async canSee(lead: { assignedTo: string | null; card: { ownerId: string } | null }): Promise<Mentionable[]> {
    const members = await this.db.membership.findMany({
      where: { status: 'ACTIVE', user: { deletedAt: null } },
      select: { role: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    return members
      .filter((m) => m.role !== 'EMPLOYEE' || m.user.id === lead.assignedTo || m.user.id === lead.card?.ownerId)
      .map((m) => ({ id: m.user.id, name: m.user.name || m.user.email.split('@')[0]!, email: m.user.email, avatarUrl: m.user.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The mentions that stand: teammates who can see the lead, each once, never the writer. */
  private async resolve(lead: Parameters<LeadNotesService['canSee']>[0], ids: string[] | undefined, writer: string): Promise<Mention[]> {
    if (!ids?.length) return [];
    const allowed = new Map((await this.canSee(lead)).map((m) => [m.id, m.name]));
    return [...new Set(ids)].filter((id) => id !== writer && allowed.has(id)).map((id) => ({ id, name: allowed.get(id)! }));
  }

  async add(viewer: TenantContext, leadId: string, note: string, mentionIds?: string[]) {
    const lead = await this.visibleLead(viewer, leadId);
    const mentions = await this.resolve(lead, mentionIds, viewer.userId);
    const activity = await this.db.leadActivity.create({
      data: {
        leadId,
        type: 'NOTE',
        metadata: { note, manual: true, by: viewer.userId, mentions, mentionIds: mentions.map((m) => m.id) } as Prisma.InputJsonValue,
      },
      select: { id: true, type: true, metadata: true, createdAt: true },
    });
    await this.tell(viewer, lead, activity.id, note, mentions);
    return { ...activity, author: await this.author(viewer.userId) };
  }

  /** Changes one's own note; teammates newly named are told. */
  async edit(viewer: TenantContext, leadId: string, activityId: string, input: EditNoteInput) {
    const lead = await this.visibleLead(viewer, leadId);
    const row = await this.db.leadActivity.findFirst({ where: { id: activityId, leadId, type: 'NOTE' }, select: { id: true, metadata: true } });
    if (!row) throw new NotFoundException('Note not found');
    const meta = metaOf(row.metadata);
    if (meta.by !== viewer.userId) throw new ForbiddenException('Only whoever wrote a note can change it');
    const mentions = await this.resolve(lead, input.mentions, viewer.userId);
    const before = new Set(Array.isArray(meta.mentionIds) ? (meta.mentionIds as string[]) : []);
    const updated = await this.db.leadActivity.update({
      where: { id: row.id },
      data: { metadata: { ...meta, note: input.note, mentions, mentionIds: mentions.map((m) => m.id), editedAt: new Date().toISOString() } as Prisma.InputJsonValue },
      select: { id: true, type: true, metadata: true, createdAt: true },
    });
    await this.tell(viewer, lead, row.id, input.note, mentions.filter((m) => !before.has(m.id)));
    return { ...updated, author: await this.author(viewer.userId) };
  }

  /** Deletes a note: its writer may, and so may the workspace's owners and admins. */
  async remove(viewer: TenantContext, leadId: string, activityId: string) {
    await this.visibleLead(viewer, leadId);
    const row = await this.db.leadActivity.findFirst({ where: { id: activityId, leadId, type: 'NOTE' }, select: { id: true, metadata: true } });
    if (!row) throw new NotFoundException('Note not found');
    const mine = metaOf(row.metadata).by === viewer.userId;
    if (!mine && viewer.role !== 'OWNER' && viewer.role !== 'ADMIN') throw new ForbiddenException('Only whoever wrote a note, or an admin, can delete it');
    await this.db.leadActivity.delete({ where: { id: row.id } });
    return { ok: true };
  }

  /**
   * The team's notes, newest first, on the leads the viewer can see: all of
   * them, the ones naming the viewer, or the viewer's own.
   */
  async feed(viewer: TenantContext, filter: 'all' | 'mentions' | 'mine' = 'all'): Promise<TeamNote[]> {
    const rows = await this.db.leadActivity.findMany({
      where: {
        type: 'NOTE',
        // A related filter is not scoped by the tenant extension: the workspace is named here.
        lead: { orgId: viewer.orgId, deletedAt: null, ...leadsVisibleTo(viewer) },
        ...(filter === 'mentions' ? { metadata: { path: ['mentionIds'], array_contains: [viewer.userId] } } : {}),
        ...(filter === 'mine' ? { metadata: { path: ['by'], equals: viewer.userId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
      select: { id: true, metadata: true, createdAt: true, lead: { select: { id: true, name: true, company: true } } },
    });
    const authors = await this.authors(rows.map((r) => metaOf(r.metadata).by));
    return rows
      .map((r) => {
        const m = metaOf(r.metadata);
        return {
          id: r.id,
          note: typeof m.note === 'string' ? m.note : '',
          createdAt: r.createdAt.toISOString(),
          editedAt: typeof m.editedAt === 'string' ? m.editedAt : null,
          author: typeof m.by === 'string' ? authors.get(m.by) ?? null : null,
          mentions: Array.isArray(m.mentions) ? (m.mentions as Mention[]) : [],
          lead: r.lead,
        };
      })
      .filter((n) => n.note);
  }

  /** Who wrote each activity, for the lead's history. */
  async authors(ids: unknown[]): Promise<Map<string, { id: string; name: string; avatarUrl: string | null }>> {
    const wanted = [...new Set(ids.filter((v): v is string => typeof v === 'string'))];
    if (!wanted.length) return new Map();
    const users = await this.db.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true, avatarUrl: true } });
    return new Map(users.map((u) => [u.id, { id: u.id, name: u.name || u.email.split('@')[0]!, avatarUrl: u.avatarUrl }]));
  }

  private async author(id: string) {
    return (await this.authors([id])).get(id) ?? null;
  }

  private async tell(viewer: TenantContext, lead: { id: string; name: string | null; company: string | null }, noteId: string, note: string, mentions: Mention[]) {
    if (!mentions.length) return;
    await this.notifications.notifyMany(
      mentions.map((m) => m.id),
      {
        orgId: viewer.orgId,
        actorId: viewer.userId,
        type: 'lead.mentioned',
        category: 'CRM',
        priority: 'MEDIUM',
        title: `You were mentioned in a note on ${lead.name || lead.company || 'a lead'}`,
        body: excerpt(note),
        metadata: { leadId: lead.id, leadName: lead.name || lead.company || null, noteId },
      },
    );
  }
}
