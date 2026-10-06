import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { USAGE_FEATURES, dayOf } from './usage-tracker';

const DAY = 86_400_000;
const WEEKS = 8;

export interface UsageView {
  /** The first day anything was recorded: use before it isn't known. */
  since: string | null;
  range: number;
  tiles: { dau: number; wau: number; mau: number; signups: number; signupsBefore: number; workspaces: number; activeWorkspaces: number };
  /** People active each day of the range, and in the same days before it. */
  daily: { day: string; users: number; before: number }[];
  /** Of the people who signed up in the range (and still have an account), how many got how far. */
  funnel: { step: 'signedUp' | 'confirmed' | 'card' | 'published' | 'viewed' | 'lead'; users: number }[];
  /** People who used each part in the last 30 days. */
  adoption: { feature: string; users: number }[];
  /** Weekly sign-up cohorts, and the share of each active in each week after. */
  retention: { week: string; size: number; weeks: (number | null)[] }[];
  plans: { plan: string; workspaces: number }[];
}

/** Monday 00:00 UTC of the week `d` is in. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/**
 * Retention: for each cohort week, the share of its people active in week
 * 0, 1, 2… after it; null for weeks that haven't ended yet.
 */
export function retention(cohorts: { id: string; createdAt: Date }[], active: { userId: string; day: string }[], now: Date, weeks = WEEKS): UsageView['retention'] {
  const thisWeek = weekStart(now).getTime();
  const days = new Map<string, Set<string>>();
  for (const a of active) {
    let s = days.get(a.userId);
    if (!s) days.set(a.userId, (s = new Set()));
    s.add(a.day);
  }
  const out: UsageView['retention'] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = thisWeek - w * 7 * DAY;
    const members = cohorts.filter((c) => weekStart(c.createdAt).getTime() === start);
    const cells: (number | null)[] = [];
    for (let k = 0; k < weeks; k++) {
      const from = start + k * 7 * DAY;
      if (from > thisWeek) {
        cells.push(null);
        continue;
      }
      if (!members.length) {
        cells.push(null);
        continue;
      }
      const span = Array.from({ length: 7 }, (_, i) => dayOf(new Date(from + i * DAY)));
      const n = members.filter((m) => span.some((d) => days.get(m.id)?.has(d))).length;
      cells.push(n / members.length);
    }
    out.push({ week: dayOf(new Date(start)), size: members.length, weeks: cells });
  }
  return out;
}

/**
 * How the product is used, for the people who run it: active people per
 * day, how far new sign-ups get, which parts are used, whether people come
 * back week after week, and the workspaces by plan. Counts only; nothing
 * about what anyone did.
 */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private async distinctActive(from: Date, to: Date, feature = '_'): Promise<number> {
    const [r] = await this.db.$queryRaw<{ n: number }[]>`
      SELECT count(DISTINCT "userId")::int AS n FROM activity_days WHERE feature = ${feature} AND day >= ${dayOf(from)} AND day < ${dayOf(to)}`;
    return r?.n ?? 0;
  }

  async view(range: 30 | 90 = 30, now = new Date()): Promise<UsageView> {
    const tomorrow = new Date(now.getTime() + DAY);
    const from = new Date(now.getTime() - (range - 1) * DAY);
    const before = new Date(from.getTime() - range * DAY);
    const cohortFrom = new Date(weekStart(now).getTime() - (WEEKS - 1) * 7 * DAY);

    const [first, dau, wau, mau, perDay, signups, signupsBefore, funnel, adoption, plans, workspaces, activeWorkspaces, cohort] = await Promise.all([
      this.db.$queryRaw<{ day: string | null }[]>`SELECT min(day) AS day FROM activity_days`,
      this.distinctActive(now, tomorrow),
      this.distinctActive(new Date(now.getTime() - 6 * DAY), tomorrow),
      this.distinctActive(new Date(now.getTime() - 29 * DAY), tomorrow),
      this.db.$queryRaw<{ day: string; n: number }[]>`
        SELECT day, count(*)::int AS n FROM activity_days WHERE feature = '_' AND day >= ${dayOf(before)} AND day < ${dayOf(tomorrow)} GROUP BY day`,
      this.db.user.count({ where: { createdAt: { gte: from }, deletedAt: null } }),
      this.db.user.count({ where: { createdAt: { gte: before, lt: from }, deletedAt: null } }),
      this.db.$queryRaw<{ signed: number; confirmed: number; card: number; published: number; viewed: number; lead: number }[]>`
        SELECT count(*)::int AS signed,
          count(*) FILTER (WHERE u."emailVerified" IS NOT NULL)::int AS confirmed,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cards c WHERE c."ownerId" = u.id))::int AS card,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cards c WHERE c."ownerId" = u.id AND c."isPublished"))::int AS published,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e JOIN cards c ON c.id = e."cardId" WHERE c."ownerId" = u.id AND e.type = 'VIEW'))::int AS viewed,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM leads l WHERE l."assignedTo" = u.id OR l."cardId" IN (SELECT c.id FROM cards c WHERE c."ownerId" = u.id)))::int AS lead
        FROM users u WHERE u."createdAt" >= ${from} AND u."deletedAt" IS NULL`,
      this.db.$queryRaw<{ feature: string; n: number }[]>`
        SELECT feature, count(DISTINCT "userId")::int AS n FROM activity_days
        WHERE feature <> '_' AND day >= ${dayOf(new Date(now.getTime() - 29 * DAY))} GROUP BY feature`,
      this.db.$queryRaw<{ plan: string; n: number }[]>`
        SELECT plan::text AS plan, count(*)::int AS n FROM organizations WHERE "deletedAt" IS NULL GROUP BY plan`,
      this.db.organization.count({ where: { deletedAt: null } }),
      this.db.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT m."orgId")::int AS n FROM memberships m JOIN organizations o ON o.id = m."orgId"
        WHERE o."deletedAt" IS NULL AND m.status = 'ACTIVE' AND m."userId" IN (
          SELECT "userId" FROM activity_days WHERE feature = '_' AND day >= ${dayOf(new Date(now.getTime() - 29 * DAY))})`,
      this.db.user.findMany({ where: { createdAt: { gte: cohortFrom }, deletedAt: null }, select: { id: true, createdAt: true } }),
    ]);

    const active = cohort.length
      ? await this.db.activityDay.findMany({ where: { feature: '_', day: { gte: dayOf(cohortFrom) }, userId: { in: cohort.map((c) => c.id) } }, select: { userId: true, day: true } })
      : [];

    const byDay = new Map(perDay.map((r) => [r.day, r.n]));
    const daily = Array.from({ length: range }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY);
      return { day: dayOf(d), users: byDay.get(dayOf(d)) ?? 0, before: byDay.get(dayOf(new Date(d.getTime() - range * DAY))) ?? 0 };
    });
    const f = funnel[0] ?? { signed: 0, confirmed: 0, card: 0, published: 0, viewed: 0, lead: 0 };

    return {
      since: first[0]?.day ?? null,
      range,
      tiles: { dau, wau, mau, signups, signupsBefore, workspaces, activeWorkspaces: activeWorkspaces[0]?.n ?? 0 },
      daily,
      funnel: [
        { step: 'signedUp', users: f.signed },
        { step: 'confirmed', users: f.confirmed },
        { step: 'card', users: f.card },
        { step: 'published', users: f.published },
        { step: 'viewed', users: f.viewed },
        { step: 'lead', users: f.lead },
      ],
      adoption: USAGE_FEATURES.map((feature) => ({ feature, users: adoption.find((a) => a.feature === feature)?.n ?? 0 })).sort((a, b) => b.users - a.users),
      retention: retention(cohort, active, now),
      plans: plans.map((p) => ({ plan: p.plan, workspaces: p.n })).sort((a, b) => b.workspaces - a.workspaces),
    };
  }
}
