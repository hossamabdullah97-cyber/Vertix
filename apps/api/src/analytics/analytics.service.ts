import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from '../integrations/webhook.service';

const EVENT_TYPES = ['VIEW', 'CLICK', 'SAVE', 'SHARE', 'NFC_SCAN'] as const;

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
    ctx: { ip?: string; userAgent?: string; referrer?: string; metadata?: Record<string, unknown> },
  ): Promise<{ visitorId: string }> {
    const anonymousId = visitorId || randomUUID();
    const card = await this.db.card.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, orgId: true },
    });
    if (!card) return { visitorId: anonymousId };

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

  // -------- Reports (org-scoped; orgId passed explicitly for raw SQL safety) --------

  async overview(orgId: string, from: Date, to: Date) {
    // Per-type counts via groupBy (orgId auto-injected by the tenant extension).
    const grouped = await this.db.event.groupBy({
      by: ['type'],
      where: { createdAt: { gte: from, lte: to } },
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
    `);

    const leads = await this.db.lead.count({
      where: { createdAt: { gte: from, lte: to } },
    });

    return {
      totals,
      uniqueVisitors: uv[0]?.count ?? 0,
      leads,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async timeseries(orgId: string, from: Date, to: Date) {
    const rows = await this.db.$queryRaw<
      Array<{ day: Date; type: string; count: number }>
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, type, count(*)::int AS count
      FROM events
      WHERE "orgId" = ${orgId}
        AND "createdAt" >= ${from} AND "createdAt" <= ${to}
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
  async cardStats(cardId: string) {
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

  async topCards(from: Date, to: Date, limit = 5) {
    const grouped = await this.db.event.groupBy({
      by: ['cardId'],
      where: { createdAt: { gte: from, lte: to }, cardId: { not: null } },
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
  async tagPerformance(from: Date, to: Date, limit = 50) {
    const scans = await this.db.event.groupBy({
      by: ['tagId'],
      where: { createdAt: { gte: from, lte: to }, tagId: { not: null }, type: 'NFC_SCAN' },
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
   * Per-member standings for the hardware the team carries: taps, the people
   * reached, the clients produced, and how many of those clients were won.
   *
   * Counted through NfcTag.assignedUserId rather than through card ownership, so
   * a member who hands their card over, or owns several, is still credited for
   * the chip in their pocket and nothing else.
   *
   * Ordered by clients won, then clients, then people reached: a member whose
   * chip is tapped constantly but closes nothing should not lead the table.
   */
  async memberPerformance(orgId: string, from: Date, to: Date) {
    const tags = await this.db.nfcTag.findMany({
      where: { assignedUserId: { not: null } },
      select: {
        id: true,
        assignedUserId: true,
        assignedUser: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    if (tags.length === 0) return [];

    const tagIds = tags.map((t) => t.id);
    const holderByTag = new Map(tags.map((t) => [t.id, t.assignedUserId!]));

    // The stage a lead sits in is how this product records a win, so the won
    // stages have to be resolved before the leads can be judged.
    const wonStages = await this.db.pipelineStage.findMany({
      where: { orgId, isWon: true },
      select: { id: true },
    });
    const wonStageIds = new Set(wonStages.map((s) => s.id));

    const [scanRows, visitorRows, leads] = await Promise.all([
      this.db.event.groupBy({
        by: ['tagId'],
        where: { tagId: { in: tagIds }, type: 'NFC_SCAN', createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
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
      this.db.lead.findMany({
        where: { tagId: { in: tagIds }, createdAt: { gte: from, lte: to } },
        select: { tagId: true, stageId: true, value: true },
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
    const byUser = new Map<string, Row>();
    const seed = (userId: string): Row | undefined => {
      if (!byUser.has(userId)) {
        const holder = tags.find((t) => t.assignedUserId === userId)?.assignedUser;
        if (!holder) return undefined;
        byUser.set(userId, {
          user: {
            id: holder.id,
            name: holder.name,
            email: holder.email,
            avatarUrl: holder.avatarUrl ?? null,
          },
          tags: 0,
          scans: 0,
          visitors: 0,
          leads: 0,
          wonLeads: 0,
          wonValue: 0,
        });
      }
      return byUser.get(userId);
    };

    for (const tag of tags) seed(tag.assignedUserId!)!.tags += 1;
    for (const g of scanRows) {
      const row = seed(holderByTag.get(g.tagId!)!);
      if (row) row.scans += g._count._all;
    }
    for (const v of visitorRows) {
      const row = seed(holderByTag.get(v.tagId!)!);
      if (row) row.visitors += 1;
    }
    for (const lead of leads) {
      const row = seed(holderByTag.get(lead.tagId!)!);
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

  async referrers(from: Date, to: Date, limit = 6) {
    const grouped = await this.db.event.groupBy({
      by: ['referrer'],
      where: { createdAt: { gte: from, lte: to } },
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
