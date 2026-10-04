import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import type { GoalMetric, GoalPeriod, SetGoalInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { goalWindow } from './goal-window';

/** Who may set goals: the people who run the team. */
export const GOAL_SETTERS = ['OWNER', 'ADMIN', 'MANAGER'] as const;

type Counts = { total: number; byMember: Map<string, number> };
type Person = { id: string; name: string | null; email: string; avatarUrl: string | null };

export interface GoalProgress {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  scope: string;
  target: number;
  window: { from: Date; to: Date };
  /** How much of the period has gone, 0 to 1: the pace to compare with. */
  elapsed: number;
  /** TEAM: the team's total; MEMBER: that member's. */
  value?: number;
  user?: Person | null;
  /** EACH: every member this person may see, against the same target. */
  members?: { user: Person; value: number }[];
}

/**
 * A workspace's goals for this week or month, with how far each has come.
 * Counted the way the analytics count: leads and taps go to whoever's card or
 * chip brought them in, meetings and wins to whoever has the lead (else the
 * card's owner); wins are the leads moved to a won stage in the period.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private get zone() {
    return this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';
  }

  async list(viewer: TenantContext, now = new Date()): Promise<{ goals: GoalProgress[]; canEdit: boolean }> {
    const goals = await this.db.goal.findMany({
      orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    const sees = (userId: string) => (GOAL_SETTERS as readonly string[]).includes(viewer.role) || userId === viewer.userId;
    // A member sees the team's goals and their own, not a colleague's.
    const visible = goals.filter((g) => g.scope !== 'MEMBER' || sees(g.userId!));
    if (!visible.length) return { goals: [], canEdit: this.canEdit(viewer) };

    const members = await this.db.membership.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    const people: Person[] = members.map((m) => m.user);

    // Each (metric, period) is counted once, however many goals use it.
    const cache = new Map<string, Promise<Counts>>();
    const counts = (metric: GoalMetric, period: GoalPeriod) => {
      const key = `${metric}:${period}`;
      if (!cache.has(key)) {
        const w = goalWindow(period, this.zone, now);
        cache.set(key, this.count(viewer.orgId, metric, w.from, now));
      }
      return cache.get(key)!;
    };

    const out: GoalProgress[] = [];
    for (const g of visible) {
      const w = goalWindow(g.period, this.zone, now);
      const c = await counts(g.metric, g.period);
      const base = {
        id: g.id,
        metric: g.metric,
        period: g.period,
        scope: g.scope,
        target: g.target,
        window: { from: w.from, to: w.to },
        elapsed: Math.round(w.elapsed * 1000) / 1000,
      };
      if (g.scope === 'TEAM') out.push({ ...base, value: c.total });
      else if (g.scope === 'MEMBER') out.push({ ...base, user: g.user, value: c.byMember.get(g.userId!) ?? 0 });
      else
        out.push({
          ...base,
          members: people.filter((p) => sees(p.id)).map((p) => ({ user: p, value: c.byMember.get(p.id) ?? 0 })),
        });
    }
    return { goals: out, canEdit: this.canEdit(viewer) };
  }

  private canEdit(viewer: TenantContext) {
    return (GOAL_SETTERS as readonly string[]).includes(viewer.role);
  }

  /** One goal per metric, period and who it is for: setting it again changes its target. */
  async set(viewer: TenantContext, input: SetGoalInput) {
    if (!this.canEdit(viewer)) throw new ForbiddenException('Your role does not permit this action');
    if (input.userId) {
      const member = await this.db.membership.findFirst({ where: { userId: input.userId, status: 'ACTIVE' }, select: { id: true } });
      if (!member) throw new NotFoundException('Member not found');
    }
    const where = { metric: input.metric, period: input.period, scope: input.scope, userId: input.userId ?? null };
    const existing = await this.db.goal.findFirst({ where, select: { id: true } });
    if (existing) return this.db.goal.update({ where: { id: existing.id }, data: { target: input.target } });
    return this.db.goal.create({ data: { orgId: viewer.orgId, ...where, target: input.target, createdById: viewer.userId } });
  }

  async remove(viewer: TenantContext, id: string) {
    if (!this.canEdit(viewer)) throw new ForbiddenException('Your role does not permit this action');
    const goal = await this.db.goal.findFirst({ where: { id }, select: { id: true } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.db.goal.delete({ where: { id } });
    return { id, removed: true };
  }

  /** How much of `metric` the workspace, and each member, did between `from` and `to`. */
  async count(orgId: string, metric: GoalMetric, from: Date, to: Date): Promise<Counts> {
    if (metric === 'LEADS' || metric === 'TAPS') {
      const [rows, total] = await Promise.all([
        this.analytics.memberPerformance(orgId, from, to),
        metric === 'LEADS'
          ? this.db.lead.count({ where: { createdAt: { gte: from, lt: to } } })
          : this.db.event.count({ where: { type: 'NFC_SCAN', createdAt: { gte: from, lt: to } } }),
      ]);
      return { total, byMember: new Map(rows.map((r) => [r.user.id, metric === 'LEADS' ? r.leads : r.scans])) };
    }
    const rows =
      metric === 'MEETINGS'
        ? await this.db.$queryRaw<{ who: string | null; n: number }[]>`
            SELECT coalesce(l."assignedTo", c."ownerId") AS who, count(*)::int AS n
            FROM lead_activities la JOIN leads l ON l.id = la."leadId" LEFT JOIN cards c ON c.id = l."cardId"
            WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND la.type = 'MEETING'
              AND NOT coalesce((la.metadata->>'manual')::boolean, false)
              AND la."createdAt" >= ${from} AND la."createdAt" < ${to}
            GROUP BY 1`
        : (
            await this.db.$queryRaw<{ who: string | null; deals: number; value: number }[]>`
              SELECT who, count(*)::int AS deals, coalesce(sum(value), 0)::int AS value
              FROM (
                SELECT DISTINCT l.id, l.value, coalesce(l."assignedTo", c."ownerId") AS who
                FROM lead_activities la JOIN leads l ON l.id = la."leadId" LEFT JOIN cards c ON c.id = l."cardId"
                JOIN pipeline_stages s ON s.id = la.metadata->>'to' AND s."isWon"
                WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND la.type = 'STAGE_CHANGE'
                  AND la."createdAt" >= ${from} AND la."createdAt" < ${to}
              ) won
              GROUP BY who`
          ).map((r) => ({ who: r.who, n: metric === 'WON_VALUE' ? r.value : r.deals }));
    const byMember = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      total += r.n;
      if (r.who) byMember.set(r.who, (byMember.get(r.who) ?? 0) + r.n);
    }
    return { total, byMember };
  }
}
