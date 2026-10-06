import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from '../integrations/webhook.service';
import { LIVE_ORG } from '../common/live-org';

const EVENT_TYPES = ['VIEW', 'CLICK', 'SAVE', 'SHARE', 'NFC_SCAN'] as const;
/** Opening a card again within this long is the same view. */
const VIEW_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // -------- Public tracking (no tenant context) --------

  /** Records a public event for a published card. Returns the visitor id used. */
  async track(
    slug: string,
    type: 'VIEW' | 'CLICK' | 'SAVE' | 'SHARE',
    visitorId: string | undefined,
    ctx: { ip?: string; userAgent?: string; referrer?: string; metadata?: Record<string, unknown>; viewerId?: string },
  ): Promise<{ visitorId: string }> {
    const anonymousId = visitorId || randomUUID();
    const card = await this.db.card.findFirst({
      where: { slug, isPublished: true, ...LIVE_ORG },
      select: { id: true, orgId: true, ownerId: true },
    });
    if (!card) return { visitorId: anonymousId };
    // The card's own people are not its visitors: its owner opening it, or a
    // colleague in the same workspace checking it, counts as nothing.
    if (ctx.viewerId && (await this.isInsider(card, ctx.viewerId))) return { visitorId: anonymousId };

    try {
      const visitor = await this.db.visitor.upsert({
        where: { anonymousId },
        update: { device: { userAgent: ctx.userAgent, ip: ctx.ip } },
        create: {
          anonymousId,
          device: { userAgent: ctx.userAgent, ip: ctx.ip },
        },
        select: { id: true },
      });
      // A view is one look at the card: opening it again (a reload, the back
      // button, the same link twice) within the half hour is the same look.
      if (type === 'VIEW') {
        const recent = await this.db.event.findFirst({
          where: { cardId: card.id, visitorId: visitor.id, type: 'VIEW', createdAt: { gte: new Date(Date.now() - VIEW_WINDOW_MS) } },
          select: { id: true },
        });
        if (recent) return { visitorId: anonymousId };
      }
      await this.db.event.create({
        data: {
          orgId: card.orgId,
          cardId: card.id,
          visitorId: visitor.id,
          type,
          referrer: ctx.referrer,
          device: { userAgent: ctx.userAgent, ip: ctx.ip },
          // Non-financial click context (e.g. payment platform + identity).
          metadata: (ctx.metadata ?? undefined) as never,
        },
      });

      // Fan the public event out to any subscribed integrations. Only the two
      // types that map to a catalogued webhook event are forwarded; the rest
      // (CLICK/SHARE) are analytics-only. Best-effort — never blocks tracking.
      const event =
        type === 'VIEW' ? 'card.viewed' : type === 'SAVE' ? 'contact.saved' : null;
      if (event) {
        void this.webhooks
          .emit(card.orgId, event, {
            cardId: card.id,
            slug,
            visitorId: anonymousId,
            referrer: ctx.referrer ?? null,
          })
          .catch(() => undefined);
      }
    } catch (err) {
      this.logger.warn(`track failed: ${(err as Error).message}`);
    }
    return { visitorId: anonymousId };
  }

  private async isInsider(card: { orgId: string; ownerId: string | null }, userId: string): Promise<boolean> {
    if (card.ownerId === userId) return true;
    const member = await this.db.membership.findFirst({ where: { orgId: card.orgId, userId }, select: { id: true } });
    return !!member;
  }

  // -------- Reports (org-scoped; orgId passed explicitly for raw SQL safety) --------
  //
  // A member's reports cover their own cards and chips; anyone above sees the
  // whole workspace. `mine` is the member's user id, or undefined for managers.

  /** Whose reports these are: the member themself, or the whole workspace. */
  static ownerOf(viewer: TenantContext): string | undefined {
    return viewer.role === 'EMPLOYEE' ? viewer.userId : undefined;
  }

  /** The same limit in raw SQL, which bypasses the tenant extension. */
  private ownCardsSql(mine?: string) {
    return mine ? Prisma.sql`AND "cardId" IN (SELECT id FROM cards WHERE "ownerId" = ${mine})` : Prisma.empty;
  }

  async overview(orgId: string, from: Date, to: Date, mine?: string) {
    // Per-type counts via groupBy (orgId auto-injected by the tenant extension).
    const grouped = await this.db.event.groupBy({
      by: ['type'],
      where: { createdAt: { gte: from, lte: to }, ...(mine ? { card: { ownerId: mine } } : {}) },
      _count: { _all: true },
    });

    const totals: Record<string, number> = {};
    for (const t of EVENT_TYPES) totals[t] = 0;
    for (const g of grouped) totals[g.type] = g._count._all;

    // Unique visitors via raw SQL — must filter orgId explicitly (raw bypasses the extension).
    const uv = await this.db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(DISTINCT "visitorId")::int AS count
      FROM events
      WHERE "orgId" = ${orgId}
        AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        AND "visitorId" IS NOT NULL
        ${this.ownCardsSql(mine)}
    `);

    const leads = await this.db.lead.count({
      where: {
        createdAt: { gte: from, lte: to },
        ...(mine ? { OR: [{ assignedTo: mine }, { card: { ownerId: mine } }] } : {}),
      },
    });

    return {
      totals,
      uniqueVisitors: uv[0]?.count ?? 0,
      leads,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async timeseries(orgId: string, from: Date, to: Date, mine?: string) {
    const rows = await this.db.$queryRaw<
      Array<{ day: Date; type: string; count: number }>
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, type, count(*)::int AS count
      FROM events
      WHERE "orgId" = ${orgId}
        AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        ${this.ownCardsSql(mine)}
      GROUP BY day, type
      ORDER BY day ASC
    `);

    const byDay = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = r.day.toISOString().slice(0, 10);
      if (!byDay.has(key)) {
        byDay.set(key, { VIEW: 0, CLICK: 0, SAVE: 0, SHARE: 0, NFC_SCAN: 0 });
      }
      byDay.get(key)![r.type] = r.count;
    }
    return Array.from(byDay.entries()).map(([day, counts]) => ({
      day,
      ...counts,
    }));
  }

  /** Lifetime event counts for a single card, keyed by event type. */
  async cardStats(cardId: string, mine?: string) {
    if (mine && !(await this.db.card.findFirst({ where: { id: cardId, ownerId: mine }, select: { id: true } }))) {
      throw new NotFoundException('Card not found');
    }
    const grouped = await this.db.event.groupBy({
      by: ['type'],
      where: { cardId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      VIEW: 0,
      CLICK: 0,
      SAVE: 0,
      SHARE: 0,
      NFC_SCAN: 0,
    };
    for (const g of grouped) counts[g.type] = g._count._all;
    return counts;
  }

  async topCards(from: Date, to: Date, limit = 5, mine?: string) {
    const grouped = await this.db.event.groupBy({
      by: ['cardId'],
      where: { createdAt: { gte: from, lte: to }, cardId: { not: null }, ...(mine ? { card: { ownerId: mine } } : {}) },
      _count: { _all: true },
      orderBy: { _count: { cardId: 'desc' } },
      take: limit,
    });
    const ids = grouped.map((g) => g.cardId!).filter(Boolean);
    const cards = await this.db.card.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true },
    });
    const slugById = new Map(cards.map((c) => [c.id, c.slug]));
    return grouped.map((g) => ({
      cardId: g.cardId,
      // null: the card has since been deleted (the page says so in its language).
      slug: slugById.get(g.cardId!) ?? null,
      events: g._count._all,
    }));
  }

  /**
   * Per-chip performance: how many taps each piece of hardware produced, how
   * many distinct people were behind them, and how many clients came of it.
   *
   * Visitors are counted distinctly rather than as taps, because a chip tapped
   * twenty times by its own owner has reached one person, not twenty.
   */
  async tagPerformance(from: Date, to: Date, limit = 50, mine?: string) {
    // A member's chips are the ones handed to them.
    const own = mine
      ? (await this.db.nfcTag.findMany({ where: { assignedUserId: mine }, select: { id: true } })).map((t) => t.id)
      : null;
    const scans = await this.db.event.groupBy({
      by: ['tagId'],
      where: { createdAt: { gte: from, lte: to }, tagId: own ? { in: own } : { not: null }, type: 'NFC_SCAN' },
      _count: { _all: true },
      orderBy: { _count: { tagId: 'desc' } },
      take: limit,
    });
    const tagIds = scans.map((g) => g.tagId!).filter(Boolean);
    if (tagIds.length === 0) return [];

    const [tags, visitorRows, leadRows] = await Promise.all([
      this.db.nfcTag.findMany({
        where: { id: { in: tagIds } },
        select: {
          id: true,
          uid: true,
          hardwareType: true,
          lastScanAt: true,
          assignedUser: { select: { id: true, name: true, email: true } },
          card: { select: { id: true, slug: true } },
        },
      }),
      // groupBy cannot count distinct, so the visitor pairs are reduced here.
      this.db.event.findMany({
        where: {
          tagId: { in: tagIds },
          type: 'NFC_SCAN',
          visitorId: { not: null },
          createdAt: { gte: from, lte: to },
        },
        select: { tagId: true, visitorId: true },
        distinct: ['tagId', 'visitorId'],
      }),
      this.db.lead.groupBy({
        by: ['tagId'],
        where: { tagId: { in: tagIds }, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const visitorsByTag = new Map<string, number>();
    for (const row of visitorRows) {
      if (!row.tagId) continue;
      visitorsByTag.set(row.tagId, (visitorsByTag.get(row.tagId) ?? 0) + 1);
    }
    const leadsByTag = new Map(leadRows.map((r) => [r.tagId!, r._count._all]));
    const tagById = new Map(tags.map((t) => [t.id, t]));

    return scans.map((g) => {
      const tag = tagById.get(g.tagId!);
      return {
        tagId: g.tagId,
        uid: tag?.uid ?? null,
        hardwareType: tag?.hardwareType ?? null,
        holder: tag?.assignedUser
          ? {
              id: tag.assignedUser.id,
              name: tag.assignedUser.name,
              email: tag.assignedUser.email,
            }
          : null,
        cardSlug: tag?.card?.slug ?? null,
        scans: g._count._all,
        visitors: visitorsByTag.get(g.tagId!) ?? 0,
        leads: leadsByTag.get(g.tagId!) ?? 0,
        lastScanAt: tag?.lastScanAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Per-member standings: the chips they carry and their taps, the people
   * reached, the clients they brought in, and how many of those were won.
   *
   * A client is credited to whoever brought them: the holder of the chip that
   * was tapped (NfcTag.assignedUserId, so a member is credited for the chip in
   * their pocket even on someone else's card), and otherwise the owner of the
   * card whose link, QR code or form they came through. Members with a card
   * but no chip are ranked too.
   *
   * Ordered by clients won, then clients, then people reached: a member whose
   * card is opened constantly but closes nothing should not lead the table.
   */
  async memberPerformance(orgId: string, from: Date, to: Date, mine?: string) {
    // A member sees their own line, not how colleagues are doing.
    const [tags, cards] = await Promise.all([
      this.db.nfcTag.findMany({
        where: { assignedUserId: mine ?? { not: null } },
        select: { id: true, assignedUserId: true },
      }),
      this.db.card.findMany({ where: mine ? { ownerId: mine } : {}, select: { id: true, ownerId: true } }),
    ]);
    if (tags.length === 0 && cards.length === 0) return [];

    const tagIds = tags.map((t) => t.id);
    const cardIds = cards.map((c) => c.id);
    const holderByTag = new Map(tags.map((t) => [t.id, t.assignedUserId!]));
    const ownerByCard = new Map(cards.map((c) => [c.id, c.ownerId]));
    const userIds = [...new Set([...holderByTag.values(), ...ownerByCard.values()])];

    // The stage a lead sits in is how this product records a win, so the won
    // stages have to be resolved before the leads can be judged.
    const wonStages = await this.db.pipelineStage.findMany({
      where: { orgId, isWon: true },
      select: { id: true },
    });
    const wonStageIds = new Set(wonStages.map((s) => s.id));

    const [users, scanRows, tagVisitors, cardVisitors, leads] = await Promise.all([
      this.db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, avatarUrl: true },
      }),
      this.db.event.groupBy({
        by: ['tagId'],
        where: { tagId: { in: tagIds }, type: 'NFC_SCAN', createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.db.event.findMany({
        where: { tagId: { in: tagIds }, type: 'NFC_SCAN', visitorId: { not: null }, createdAt: { gte: from, lte: to } },
        select: { tagId: true, visitorId: true },
        distinct: ['tagId', 'visitorId'],
      }),
      // People who opened a member's card some other way (link, QR code).
      this.db.event.findMany({
        where: { cardId: { in: cardIds }, tagId: null, type: 'VIEW', visitorId: { not: null }, createdAt: { gte: from, lte: to } },
        select: { cardId: true, visitorId: true },
        distinct: ['cardId', 'visitorId'],
      }),
      this.db.lead.findMany({
        where: { OR: [{ tagId: { in: tagIds } }, { cardId: { in: cardIds } }], createdAt: { gte: from, lte: to } },
        select: { tagId: true, cardId: true, stageId: true, value: true },
      }),
    ]);

    interface Row {
      user: { id: string; name: string | null; email: string; avatarUrl: string | null };
      tags: number;
      scans: number;
      visitors: number;
      leads: number;
      wonLeads: number;
      wonValue: number;
    }
    const byUser = new Map<string, Row>(
      users.map((u) => [
        u.id,
        { user: { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null }, tags: 0, scans: 0, visitors: 0, leads: 0, wonLeads: 0, wonValue: 0 },
      ]),
    );
    const rowOf = (userId: string | undefined) => (userId ? byUser.get(userId) : undefined);

    for (const tag of tags) {
      const row = rowOf(tag.assignedUserId!);
      if (row) row.tags += 1;
    }
    for (const g of scanRows) {
      const row = rowOf(holderByTag.get(g.tagId!));
      if (row) row.scans += g._count._all;
    }
    // A person who tapped the chip and later opened the link is one person reached.
    const reached = new Map<string, Set<string>>();
    const reach = (userId: string | undefined, visitorId: string | null) => {
      if (!userId || !visitorId || !byUser.has(userId)) return;
      if (!reached.has(userId)) reached.set(userId, new Set());
      reached.get(userId)!.add(visitorId);
    };
    for (const v of tagVisitors) reach(holderByTag.get(v.tagId!), v.visitorId);
    for (const v of cardVisitors) reach(ownerByCard.get(v.cardId!), v.visitorId);
    for (const [userId, people] of reached) byUser.get(userId)!.visitors = people.size;
    for (const lead of leads) {
      // The chip that was tapped wins; a tag outside this list falls back to the card.
      const row = rowOf((lead.tagId && holderByTag.get(lead.tagId)) || (lead.cardId ? ownerByCard.get(lead.cardId) : undefined));
      if (!row) continue;
      row.leads += 1;
      if (lead.stageId && wonStageIds.has(lead.stageId)) {
        row.wonLeads += 1;
        row.wonValue += lead.value;
      }
    }

    return [...byUser.values()].sort(
      (a, b) => b.wonLeads - a.wonLeads || b.leads - a.leads || b.visitors - a.visitors,
    );
  }

  async referrers(from: Date, to: Date, limit = 6, mine?: string) {
    const grouped = await this.db.event.groupBy({
      by: ['referrer'],
      where: { createdAt: { gte: from, lte: to }, ...(mine ? { card: { ownerId: mine } } : {}) },
      _count: { _all: true },
      orderBy: { _count: { referrer: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => ({
      referrer: g.referrer ?? 'direct',
      events: g._count._all,
    }));
  }
}
