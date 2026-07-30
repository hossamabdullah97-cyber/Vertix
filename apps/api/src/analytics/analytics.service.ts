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
      slug: slugById.get(g.cardId!) ?? '(deleted)',
      events: g._count._all,
    }));
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
