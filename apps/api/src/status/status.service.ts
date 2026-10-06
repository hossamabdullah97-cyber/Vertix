import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type {
  ComponentState,
  CreateIncidentInput,
  IncidentUpdateInput,
  StatusComponentId,
  StatusIncidentView,
  StatusView,
} from '@vertex/shared';
import { STATUS_COMPONENTS } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const CHECK_MS = 60_000;
const DAYS = 90;
const CACHE_MS = 30_000;
/** A query slower than this counts as degraded. */
const SLOW_MS = 1500;

type Check = { id: StatusComponentId; status: Exclude<ComponentState, 'MAINTENANCE'>; latencyMs: number | null; detail: string | null };

const RANK: Record<ComponentState, number> = { OPERATIONAL: 0, MAINTENANCE: 1, DEGRADED: 2, OUTAGE: 3 };
export const worst = (a: ComponentState, b: ComponentState): ComponentState => (RANK[b] > RANK[a] ? b : a);

/** YYYY-MM-DD in UTC. */
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

type IncidentRow = {
  id: string;
  title: string;
  titleAr: string | null;
  impact: 'MINOR' | 'MAJOR' | 'MAINTENANCE';
  status: 'SCHEDULED' | 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  components: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updates: { id: string; status: IncidentRow['status']; message: string; messageAr: string | null; createdAt: Date }[];
};

/** What an unresolved incident does to the parts it names right now; maintenance only counts inside its window. */
export function incidentEffect(i: Pick<IncidentRow, 'impact' | 'status' | 'startsAt' | 'endsAt'>, now: Date): ComponentState | null {
  if (i.status === 'RESOLVED') return null;
  if (i.impact === 'MAINTENANCE') {
    if (!i.startsAt || i.startsAt > now || (i.endsAt && i.endsAt < now)) return null;
    return 'MAINTENANCE';
  }
  return i.impact === 'MAJOR' ? 'OUTAGE' : 'DEGRADED';
}

const iso = (d: Date | null) => d?.toISOString() ?? null;
const present = (i: IncidentRow): StatusIncidentView => ({
  id: i.id,
  title: i.title,
  titleAr: i.titleAr,
  impact: i.impact,
  status: i.status,
  components: i.components as StatusComponentId[],
  startsAt: iso(i.startsAt),
  endsAt: iso(i.endsAt),
  resolvedAt: iso(i.resolvedAt),
  createdAt: i.createdAt.toISOString(),
  updates: i.updates.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
});

/**
 * The public status page: every minute the platform checks its own parts
 * (the app and its database, public cards, email delivery, webhook
 * delivery), keeps the result per part and day for 90 days, and lays over
 * it what the people who run the platform post about outages and planned
 * maintenance.
 */
@Injectable()
export class StatusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusService.name);
  private timer?: NodeJS.Timeout;
  private cache?: { at: number; view: StatusView };

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runChecks().catch((e) => this.logger.warn(`status check failed: ${(e as Error).message}`)), CHECK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async timed(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; error?: string }> {
    const t = Date.now();
    try {
      await fn();
      return { ok: true, ms: Date.now() - t };
    } catch (e) {
      return { ok: false, ms: Date.now() - t, error: (e as Error).message.slice(0, 200) };
    }
  }

  /** Looks at each part once. */
  async check(now = new Date()): Promise<Check[]> {
    const fromLatency = (id: StatusComponentId, r: { ok: boolean; ms: number; error?: string }): Check => ({
      id,
      status: !r.ok ? 'OUTAGE' : r.ms > SLOW_MS ? 'DEGRADED' : 'OPERATIONAL',
      latencyMs: r.ms,
      detail: !r.ok ? r.error ?? 'failed' : r.ms > SLOW_MS ? `slow: ${r.ms} ms` : null,
    });

    const app = await this.timed(() => this.db.$queryRaw`SELECT 1`);
    const cards = await this.timed(() => this.db.$queryRaw`SELECT id FROM cards WHERE "isPublished" AND "deletedAt" IS NULL LIMIT 1`);

    // Email: how sends to the provider went in the last 15 minutes.
    const sent = this.mail?.recentOutcomes(15 * 60_000, now.getTime()) ?? { sent: 0, failed: 0 };
    const email: Check = {
      id: 'email',
      status: sent.failed >= 5 && sent.failed === sent.sent ? 'OUTAGE' : sent.failed >= 2 && sent.failed / sent.sent > 0.5 ? 'DEGRADED' : 'OPERATIONAL',
      latencyMs: null,
      detail: sent.failed ? `${sent.failed} of ${sent.sent} sends failed in 15 min` : null,
    };

    // Webhooks: deliveries that should have gone out over 10 minutes ago mean the sender is behind.
    let webhooks: Check;
    const late = await this.timed(async () => {
      const rows = await this.db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM webhook_deliveries
        WHERE status = 'PENDING' AND "nextAttemptAt" < ${new Date(now.getTime() - 10 * 60_000)}`;
      webhooks = {
        id: 'webhooks',
        status: Number(rows[0]?.n ?? 0) > 200 ? 'OUTAGE' : Number(rows[0]?.n ?? 0) > 0 ? 'DEGRADED' : 'OPERATIONAL',
        latencyMs: null,
        detail: Number(rows[0]?.n ?? 0) ? `${rows[0]!.n} deliveries overdue` : null,
      };
    });
    if (!late.ok) webhooks = { id: 'webhooks', status: 'OUTAGE', latencyMs: null, detail: late.error ?? 'failed' };

    return [fromLatency('app', app), fromLatency('cards', cards), email, webhooks!];
  }

  /** Checks every part and keeps the result: the latest per part, and a count per part and day. */
  async runChecks(now = new Date()): Promise<Check[]> {
    const checks = await this.check(now);
    const day = dayOf(now);
    for (const c of checks) {
      await this.db.statusComponent.upsert({
        where: { id: c.id },
        create: { id: c.id, status: c.status, latencyMs: c.latencyMs, detail: c.detail, checkedAt: now },
        update: { status: c.status, latencyMs: c.latencyMs, detail: c.detail, checkedAt: now },
      });
      const add = { checks: 1, degraded: c.status === 'DEGRADED' ? 1 : 0, down: c.status === 'OUTAGE' ? 1 : 0 };
      await this.db.statusDay.upsert({
        where: { component_day: { component: c.id, day } },
        create: { component: c.id, day, ...add },
        update: { checks: { increment: add.checks }, degraded: { increment: add.degraded }, down: { increment: add.down } },
      });
    }
    this.cache = undefined;
    return checks;
  }

  /** The page: each part's state now and its 90 days, what is going on, and what was resolved lately. */
  async view(now = new Date()): Promise<StatusView> {
    if (this.cache && now.getTime() - this.cache.at < CACHE_MS) return this.cache.view;
    const days = Array.from({ length: DAYS }, (_, i) => dayOf(new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000)));
    const [latest, perDay, open, resolved] = await Promise.all([
      this.db.statusComponent.findMany(),
      this.db.statusDay.findMany({ where: { day: { gte: days[0] } } }),
      this.db.statusIncident.findMany({ where: { status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' }, include: { updates: { orderBy: { createdAt: 'desc' } } } }),
      this.db.statusIncident.findMany({
        where: { status: 'RESOLVED', resolvedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
        orderBy: { resolvedAt: 'desc' },
        take: 20,
        include: { updates: { orderBy: { createdAt: 'desc' } } },
      }),
    ]);

    const components = STATUS_COMPONENTS.map((id) => {
      let state: ComponentState = (latest.find((l) => l.id === id)?.status as ComponentState | undefined) ?? 'OPERATIONAL';
      for (const i of open) if (i.components.includes(id)) state = worst(state, incidentEffect(i, now) ?? 'OPERATIONAL');
      const mine = perDay.filter((d) => d.component === id);
      const checks = mine.reduce((n, d) => n + d.checks, 0);
      const down = mine.reduce((n, d) => n + d.down, 0);
      return {
        id,
        state,
        uptime: checks ? (checks - down) / checks : null,
        days: days.map((day) => {
          const d = mine.find((x) => x.day === day);
          if (!d || !d.checks) return { day, uptime: null, worst: null };
          return { day, uptime: (d.checks - d.down) / d.checks, worst: (d.down ? 'OUTAGE' : d.degraded ? 'DEGRADED' : 'OPERATIONAL') as ComponentState };
        }),
      };
    });

    const checkedAt = latest.reduce<Date | null>((a, l) => (!a || l.checkedAt > a ? l.checkedAt : a), null);
    const view: StatusView = {
      overall: components.reduce<ComponentState>((a, c) => worst(a, c.state), 'OPERATIONAL'),
      components,
      active: open.map((i) => present(i as IncidentRow)),
      recent: resolved.map((i) => present(i as IncidentRow)),
      checkedAt: iso(checkedAt),
    };
    this.cache = { at: now.getTime(), view };
    return view;
  }

  // ── For the people who run the platform ──

  async incidents(): Promise<StatusIncidentView[]> {
    const rows = await this.db.statusIncident.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { updates: { orderBy: { createdAt: 'desc' } } } });
    return rows.map((i) => present(i as IncidentRow));
  }

  async latest() {
    return this.db.statusComponent.findMany({ orderBy: { id: 'asc' } });
  }

  async create(input: CreateIncidentInput): Promise<StatusIncidentView> {
    const status = input.impact === 'MAINTENANCE' && input.status === 'INVESTIGATING' ? 'SCHEDULED' : input.status;
    const row = await this.db.statusIncident.create({
      data: {
        title: input.title,
        titleAr: input.titleAr || null,
        impact: input.impact,
        status,
        components: input.components,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
        updates: { create: { status, message: input.message, messageAr: input.messageAr || null } },
      },
      include: { updates: true },
    });
    this.cache = undefined;
    return present(row as IncidentRow);
  }

  async addUpdate(id: string, input: IncidentUpdateInput): Promise<StatusIncidentView> {
    const found = await this.db.statusIncident.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Incident not found');
    await this.db.statusIncidentUpdate.create({ data: { incidentId: id, status: input.status, message: input.message, messageAr: input.messageAr || null } });
    const row = await this.db.statusIncident.update({
      where: { id },
      data: { status: input.status, resolvedAt: input.status === 'RESOLVED' ? new Date() : null },
      include: { updates: { orderBy: { createdAt: 'desc' } } },
    });
    this.cache = undefined;
    return present(row as IncidentRow);
  }

  /** A post made by mistake. */
  async remove(id: string) {
    const { count } = await this.db.statusIncident.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Incident not found');
    this.cache = undefined;
    return { ok: true };
  }
}
