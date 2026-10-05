import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTenant } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { hourIn } from '../leads/follow-up.service';
import { isQuietWeek, weeklyReportHtml, weeklyReportSubject, type ReportLang, type WeeklyReport } from './weekly-report';

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
/** Sunday, the first day of the working week in Egypt, from this hour. */
const SEND_DAY = 0;
const SEND_HOUR = 9;
const SWEEP_MS = 30 * 60_000;

/** The weekday (0 = Sunday) and date of `now` in `zone`. */
export function localDay(zone: string, now: Date): { weekday: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, date: `${get('year')}-${get('month')}-${get('day')}` };
}

/**
 * The weekly report: every Sunday morning, an email to the people who run a
 * workspace about its week (weekly-report.ts). Owners and admins get it
 * unless they turned it off; managers if they turned it on. Only to confirmed
 * addresses, and not about a workspace that had nothing happen at all.
 */
@Injectable()
export class WeeklyReportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyReportService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private get zone() {
    return this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`weekly report sweep failed: ${(e as Error).message}`)), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** On Sunday from 9:00, sends each workspace's report once. Returns how many emails went out. */
  async sweep(now = new Date()): Promise<number> {
    const { weekday, date } = localDay(this.zone, now);
    if (weekday !== SEND_DAY || hourIn(this.zone, now) < SEND_HOUR) return 0;

    const orgs = await this.db.organization.findMany({ where: { isActive: true }, select: { id: true } });
    let sent = 0;
    for (const { id } of orgs) {
      // Claimed for this Sunday in one statement, so two servers send it once.
      const claimed = await this.db.$executeRaw`
        UPDATE organizations
        SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('weeklyReportWeek', ${date}::text)
        WHERE id = ${id} AND "deletedAt" IS NULL AND coalesce(settings->>'weeklyReportWeek', '') <> ${date}`;
      if (!claimed) continue;
      try {
        sent += await this.sendFor(id, now);
      } catch (e) {
        this.logger.error(`Weekly report for ${id} failed: ${(e as Error).message}`);
      }
    }
    if (sent) this.logger.log(`Sent ${sent} weekly report${sent === 1 ? '' : 's'}`);
    return sent;
  }

  /** The people a workspace's report goes to, with the language each reads it in. */
  async recipients(orgId: string): Promise<{ userId: string; email: string; lang: ReportLang }[]> {
    const members = await this.db.membership.findMany({
      where: { orgId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN', 'MANAGER'] }, user: { deletedAt: null, emailVerified: { not: null } } },
      select: { role: true, user: { select: { id: true, email: true, leadAlerts: { select: { weeklyReport: true, lang: true } } } } },
    });
    return members
      .filter((m) => m.user.leadAlerts?.weeklyReport ?? m.role !== 'MANAGER')
      .map((m) => ({ userId: m.user.id, email: m.user.email, lang: (m.user.leadAlerts?.lang === 'ar' ? 'ar' : 'en') as ReportLang }));
  }

  private async sendFor(orgId: string, now: Date): Promise<number> {
    const to = await this.recipients(orgId);
    if (!to.length) return 0;
    const report = await this.build(orgId, now);
    if (isQuietWeek(report)) return 0;
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
    let sent = 0;
    for (const r of to) {
      const ok = await this.mail.send({ to: r.email, subject: weeklyReportSubject(report, r.lang), html: weeklyReportHtml(report, r.lang, appUrl, orgId) });
      if (ok) sent++;
    }
    return sent;
  }

  /** "Send me this week's report": the person's own copy, now, whatever the day. */
  async preview(userId: string, orgId: string): Promise<{ sent: boolean; quiet: boolean }> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true, leadAlerts: { select: { lang: true } } } });
    if (!user) return { sent: false, quiet: false };
    const lang: ReportLang = user.leadAlerts?.lang === 'ar' ? 'ar' : 'en';
    const report = await this.build(orgId, new Date());
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
    const sent = await this.mail.send({ to: user.email, subject: weeklyReportSubject(report, lang), html: weeklyReportHtml(report, lang, appUrl, orgId) });
    return { sent, quiet: isQuietWeek(report) };
  }

  /** The week up to `now`, against the week before it. */
  build(orgId: string, now: Date): Promise<WeeklyReport> {
    // The analytics read through the tenant extension, which needs the workspace in context.
    return runWithTenant({ orgId, userId: 'system', role: 'OWNER' }, () => this.collect(orgId, now));
  }

  private async collect(orgId: string, now: Date): Promise<WeeklyReport> {
    const from = new Date(now.getTime() - WEEK);
    const before = new Date(from.getTime() - WEEK);

    const [org, thisWeek, lastWeek, members, chips] = await Promise.all([
      this.db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.analytics.overview(orgId, from, now),
      this.analytics.overview(orgId, before, from),
      this.analytics.memberPerformance(orgId, from, now),
      this.analytics.tagPerformance(from, now, 1),
    ]);

    const meetings = async (a: Date, b: Date) => {
      const [row] = await this.db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM lead_activities la JOIN leads l ON l.id = la."leadId"
        WHERE l."orgId" = ${orgId} AND la.type = 'MEETING' AND la."createdAt" >= ${a} AND la."createdAt" < ${b}
          AND NOT coalesce((la.metadata->>'manual')::boolean, false)`;
      return row?.n ?? 0;
    };

    const [meetingsNow, meetingsBefore, [won], [reply], waitingRows, [waitingCount]] = await Promise.all([
      meetings(from, now),
      meetings(before, from),
      this.db.$queryRaw<{ n: number; value: number }[]>`
        SELECT count(*)::int AS n, coalesce(sum(value), 0)::int AS value FROM (
          SELECT DISTINCT l.id, l.value
          FROM lead_activities la JOIN leads l ON l.id = la."leadId"
          JOIN pipeline_stages s ON s.id = la.metadata->>'to' AND s."isWon"
          WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND la.type = 'STAGE_CHANGE' AND la."createdAt" >= ${from} AND la."createdAt" < ${now}
        ) won`,
      this.db.$queryRaw<{ contacted: number; median: number | null }[]>`
        SELECT count("firstContactedAt")::int AS contacted,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM "firstContactedAt" - "createdAt") / 3600) AS median
        FROM leads WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${now}`,
      this.db.$queryRaw<{ id: string; name: string | null; company: string | null; createdAt: Date }[]>`
        SELECT l.id, l.name, l.company, l."createdAt" FROM leads l LEFT JOIN pipeline_stages s ON s.id = l."stageId"
        WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND l."firstContactedAt" IS NULL AND NOT coalesce(s."isWon", false)
          AND l."createdAt" >= ${new Date(now.getTime() - 14 * 24 * HOUR)} AND l."createdAt" <= ${new Date(now.getTime() - 24 * HOUR)}
        ORDER BY l."createdAt" ASC LIMIT 5`,
      this.db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM leads l LEFT JOIN pipeline_stages s ON s.id = l."stageId"
        WHERE l."orgId" = ${orgId} AND l."deletedAt" IS NULL AND l."firstContactedAt" IS NULL AND NOT coalesce(s."isWon", false)
          AND l."createdAt" >= ${new Date(now.getTime() - 14 * 24 * HOUR)} AND l."createdAt" <= ${new Date(now.getTime() - 24 * HOUR)}`,
    ]);

    const chip = chips[0];
    const chipHolder = chip?.holder?.name || chip?.holder?.email;

    return {
      orgName: org?.name ?? '',
      from,
      to: now,
      taps: [thisWeek.totals.NFC_SCAN ?? 0, lastWeek.totals.NFC_SCAN ?? 0],
      reached: [thisWeek.uniqueVisitors, lastWeek.uniqueVisitors],
      leads: [thisWeek.leads, lastWeek.leads],
      meetings: [meetingsNow, meetingsBefore],
      won: { count: won?.n ?? 0, value: won?.value ?? 0 },
      contacted: reply?.contacted ?? 0,
      medianReplyHours: reply?.median === null || reply?.median === undefined ? null : Number(reply.median),
      waiting: {
        total: waitingCount?.n ?? 0,
        top: waitingRows.map((l) => ({ id: l.id, name: l.name, company: l.company, hours: Math.round((now.getTime() - new Date(l.createdAt).getTime()) / HOUR) })),
      },
      members: members
        .filter((m) => m.leads > 0 || m.scans > 0)
        .slice(0, 3)
        .map((m) => ({ name: m.user.name || m.user.email, leads: m.leads, scans: m.scans })),
      topChip: chip && chip.scans > 0 ? { label: chipHolder || chip.uid || '', scans: chip.scans } : null,
    };
  }
}

