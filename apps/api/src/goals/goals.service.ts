import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTenant, type TenantContext } from '@vertex/db';
import type { GoalMetric, GoalPeriod, SetGoalInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
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
const METRIC_TEXT: Record<GoalMetric, string> = {
  LEADS: 'New leads',
  TAPS: 'Card taps',
  MEETINGS: 'Meetings booked',
  WON_DEALS: 'Deals won',
  WON_VALUE: 'Won value',
};
const SWEEP_MS = 15 * 60_000;
/** Looking at the dashboard checks for reached goals at most this often per workspace. */
const CHECK_EVERY_MS = 60_000;

@Injectable()
export class GoalsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoalsService.name);
  private timer?: NodeJS.Timeout;
  private readonly lastCheck = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`goal sweep failed: ${(e as Error).message}`)), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Every workspace with goals: anything reached since the last look is celebrated. */
  async sweep(now = new Date()): Promise<number> {
    const orgs = await this.db.$queryRaw<{ orgId: string }[]>`
      SELECT DISTINCT g."orgId" FROM goals g JOIN organizations o ON o.id = g."orgId" WHERE o."deletedAt" IS NULL AND o."isActive"`;
    let sent = 0;
    for (const { orgId } of orgs) sent += await this.celebrate(orgId, now).catch(() => 0);
    return sent;
  }

  /**
   * Notifies the people a reached goal concerns, once per goal, period and
   * person (claimed in the database, so two servers or two looks send it
   * once): a team goal goes to everyone; a member's to them and the team's
   * leads. Returns how many achievements were new.
   */
  async celebrate(orgId: string, now = new Date()): Promise<number> {
    const system: TenantContext = { orgId, userId: 'system', role: 'OWNER' };
    return runWithTenant(system, async () => {
      const { goals } = await this.list(system, now, false);
      const reached: { goal: GoalProgress; who: string; value: number; user?: Person | null }[] = [];
      for (const g of goals) {
        if (g.scope === 'EACH') for (const m of g.members ?? []) if (m.value >= g.target) reached.push({ goal: g, who: m.user.id, value: m.value, user: m.user });
        if (g.scope === 'TEAM' && (g.value ?? 0) >= g.target) reached.push({ goal: g, who: 'team', value: g.value! });
        if (g.scope === 'MEMBER' && g.user && (g.value ?? 0) >= g.target) reached.push({ goal: g, who: g.user.id, value: g.value!, user: g.user });
      }
      if (!reached.length) return 0;

      const members = await this.db.membership.findMany({ where: { status: 'ACTIVE' }, select: { userId: true, role: true } });
      const everyone = members.map((m) => m.userId);
      const leads = members.filter((m) => (GOAL_SETTERS as readonly string[]).includes(m.role)).map((m) => m.userId);
      let fresh = 0;
      for (const r of reached) {
        const claim = await this.db.$executeRaw`
          INSERT INTO goal_achievements (id, "goalId", "periodStart", who, value)
          VALUES (${`ga_${r.goal.id}_${r.goal.window.from.getTime()}_${r.who}`}, ${r.goal.id}, ${r.goal.window.from}, ${r.who}, ${r.value})
          ON CONFLICT ("goalId", "periodStart", who) DO NOTHING`;
        if (!claim) continue;
        fresh++;
        const what = `${METRIC_TEXT[r.goal.metric]} ${r.goal.period === 'WEEK' ? 'this week' : 'this month'}: ${r.value} of ${r.goal.target}`;
        const metadata = { goalId: r.goal.id, metric: r.goal.metric, period: r.goal.period, scope: r.goal.scope, target: r.goal.target, value: r.value };
        if (r.who === 'team') {
          await this.notifications.notifyMany(everyone, { orgId, type: 'goal.team_reached', category: 'ORGANIZATION', priority: 'MEDIUM', title: 'The team reached its goal', body: what, metadata });
        } else {
          const name = r.user?.name || r.user?.email || '';
          await this.notifications.notify({ userId: r.who, orgId, type: 'goal.you_reached', category: 'ORGANIZATION', priority: 'MEDIUM', title: 'You reached your goal', body: what, metadata });
          await this.notifications.notifyMany(
            leads.filter((id) => id !== r.who),
            { orgId, type: 'goal.member_reached', category: 'ORGANIZATION', priority: 'LOW', title: `${name} reached their goal`, body: what, metadata: { ...metadata, memberId: r.who, memberName: name } },
          );
        }
      }
      return fresh;
    });
  }

  private get db() {
    return this.prisma.client;
  }

  private get zone() {
    return this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';
  }

  async list(viewer: TenantContext, now = new Date(), check = true): Promise<{ goals: GoalProgress[]; canEdit: boolean }> {
    // Someone looking is a good moment to see whether a goal was just reached.
    if (check && Date.now() - (this.lastCheck.get(viewer.orgId) ?? 0) > CHECK_EVERY_MS) {
      this.lastCheck.set(viewer.orgId, Date.now());
      void this.celebrate(viewer.orgId, now).catch((e) => this.logger.warn(`goal check failed: ${(e as Error).message}`));
    }
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
    const saved = existing
      ? await this.db.goal.update({ where: { id: existing.id }, data: { target: input.target } })
      : await this.db.goal.create({ data: { orgId: viewer.orgId, ...where, target: input.target, createdById: viewer.userId } });
    // A target already met is celebrated now, not at the next look.
    void this.celebrate(viewer.orgId).catch((e) => this.logger.warn(`goal check failed: ${(e as Error).message}`));
    return saved;
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
