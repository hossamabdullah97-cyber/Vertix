import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

const DAY = 86_400_000;
/** The "usual day" an event is compared with: the four weeks before it. */
const BASELINE_DAYS = 28;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface OccasionReport {
  occasion: { id: string; name: string; startsOn: string; endsOn: string; days: number; status: 'upcoming' | 'live' | 'past'; day: number | null };
  totals: {
    taps: number;
    reached: number;
    views: number;
    leads: number;
    meetings: number;
    contacted: number;
    medianReplyHours: number | null;
    won: { count: number; value: number };
  };
  /** Per day over the four weeks before, for "3× your usual day". */
  usual: { leads: number; taps: number; reached: number };
  days: { date: string; taps: number; views: number; leads: number }[];
  /** Taps and card visits by hour of the day, in the workspace's time zone, all days together. */
  hours: number[];
  members: Awaited<ReturnType<AnalyticsService['memberPerformance']>>;
  chips: Awaited<ReturnType<AnalyticsService['tagPerformance']>>;
  leads: {
    id: string;
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    createdAt: Date;
    firstContactedAt: Date | null;
    stageId: string | null;
    value: number;
    by: string | null;
  }[];
}

/**
 * What an exhibition, a launch or any other occasion the workspace marked
 * brought in, the whole of it, measured against an ordinary day: the case a
 * company makes for its next stand. Days are whole UTC days, as on the
 * charts; hours are in DEFAULT_TIMEZONE, which is where the stand was.
 */
@Injectable()
export class OccasionReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async report(tenant: TenantContext, id: string, now = new Date()): Promise<OccasionReport> {
    const o = await this.db.occasion.findFirst({ where: { id }, select: { id: true, name: true, startsOn: true, endsOn: true } });
    if (!o) throw new NotFoundException('Occasion not found');
    const orgId = tenant.orgId;
    const zone = this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';

    const from = new Date(`${dayKey(o.startsOn)}T00:00:00Z`);
    const end = new Date(new Date(`${dayKey(o.endsOn)}T00:00:00Z`).getTime() + DAY);
    // A running occasion is measured up to now.
    const to = now < end ? now : end;
    const days = Math.round((end.getTime() - from.getTime()) / DAY);
    const status = now < from ? 'upcoming' : now >= end ? 'past' : 'live';
    const occasion = {
      id: o.id,
      name: o.name,
      startsOn: dayKey(o.startsOn),
      endsOn: dayKey(o.endsOn),
      days,
      status,
      day: status === 'live' ? Math.floor((now.getTime() - from.getTime()) / DAY) + 1 : null,
    } as const;

    const baseFrom = new Date(from.getTime() - BASELINE_DAYS * DAY);
    const empty = status === 'upcoming';
    const window = empty ? { from, to: from } : { from, to };

    const [overview, baseline, members, chips, dayRows, hourRows, [meetings], [reply], [won], leads] = await Promise.all([
      this.analytics.overview(orgId, window.from, window.to),
      this.analytics.overview(orgId, baseFrom, from),
      empty ? Promise.resolve([]) : this.analytics.memberPerformance(orgId, window.from, window.to),
      empty ? Promise.resolve([]) : this.analytics.tagPerformance(window.from, window.to, 5),
      this.db.$queryRaw<{ day: string; taps: number; views: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE type = 'NFC_SCAN')::int AS taps,
               count(*) FILTER (WHERE type = 'VIEW')::int AS views
        FROM events WHERE "orgId" = ${orgId} AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to}
        GROUP BY 1`,
      this.db.$queryRaw<{ hour: number; n: number }[]>`
        SELECT extract(hour FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone})::int AS hour, count(*)::int AS n
        FROM events WHERE "orgId" = ${orgId} AND type IN ('NFC_SCAN', 'VIEW') AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to}
        GROUP BY 1`,
      this.db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM lead_activities la JOIN leads l ON l.id = la."leadId"
        WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND la.type = 'MEETING'
          AND NOT coalesce((la.metadata->>'manual')::boolean, false)
          AND la."createdAt" >= ${window.from} AND la."createdAt" < ${window.to}`,
      this.db.$queryRaw<{ contacted: number; median: number | null }[]>`
        SELECT count("firstContactedAt")::int AS contacted,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM "firstContactedAt" - "createdAt") / 3600) AS median
        FROM leads WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to}`,
      // The event's leads that have since been won, whenever that happened.
      this.db.$queryRaw<{ n: number; value: number }[]>`
        SELECT count(*)::int AS n, coalesce(sum(l.value), 0)::int AS value
        FROM leads l JOIN pipeline_stages s ON s.id = l."stageId" AND s."isWon"
        WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND l."createdAt" >= ${window.from} AND l."createdAt" < ${window.to}`,
      this.db.lead.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
          createdAt: true,
          firstContactedAt: true,
          stageId: true,
          value: true,
          assignee: { select: { name: true, email: true } },
          tag: { select: { assignedUser: { select: { name: true, email: true } } } },
          card: { select: { owner: { select: { name: true, email: true } } } },
        },
      }),
    ]);

    // Every day of the occasion, the quiet ones too.
    const byDay = new Map(dayRows.map((r) => [r.day, r]));
    const leadsByDay = new Map<string, number>();
    for (const l of leads) leadsByDay.set(dayKey(l.createdAt), (leadsByDay.get(dayKey(l.createdAt)) ?? 0) + 1);
    const dayList: OccasionReport['days'] = [];
    for (let t = from.getTime(); t < end.getTime(); t += DAY) {
      const key = dayKey(new Date(t));
      dayList.push({ date: key, taps: byDay.get(key)?.taps ?? 0, views: byDay.get(key)?.views ?? 0, leads: leadsByDay.get(key) ?? 0 });
    }
    const hours = Array.from({ length: 24 }, () => 0);
    for (const r of hourRows) hours[r.hour] = r.n;

    const person = (u?: { name: string | null; email: string } | null) => (u ? u.name || u.email : null);

    return {
      occasion,
      totals: {
        taps: overview.totals.NFC_SCAN ?? 0,
        reached: overview.uniqueVisitors,
        views: overview.totals.VIEW ?? 0,
        leads: overview.leads,
        meetings: meetings?.n ?? 0,
        contacted: reply?.contacted ?? 0,
        medianReplyHours: reply?.median === null || reply?.median === undefined ? null : Math.round(Number(reply.median) * 10) / 10,
        won: { count: won?.n ?? 0, value: won?.value ?? 0 },
      },
      usual: {
        leads: Math.round((baseline.leads / BASELINE_DAYS) * 10) / 10,
        taps: Math.round(((baseline.totals.NFC_SCAN ?? 0) / BASELINE_DAYS) * 10) / 10,
        reached: Math.round((baseline.uniqueVisitors / BASELINE_DAYS) * 10) / 10,
      },
      days: dayList,
      hours,
      members: members.filter((m) => m.leads > 0 || m.scans > 0 || m.visitors > 0),
      chips,
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company,
        email: l.email,
        phone: l.phone,
        createdAt: l.createdAt,
        firstContactedAt: l.firstContactedAt,
        stageId: l.stageId,
        value: l.value,
        // Whoever has it now (the assignee), else whoever brought it in: the chip's holder, else the card's owner.
        by: person(l.assignee) ?? person(l.tag?.assignedUser) ?? person(l.card?.owner),
      })),
    };
  }
}

