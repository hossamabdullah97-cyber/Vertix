import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { hourIn } from '../leads/follow-up.service';
import { engagementHtml, engagementSubject, type EmailLang, type EngagementData, type EngagementKind } from './engagement-emails';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SWEEP_MS = 30 * 60_000;
/** Sent only in the working day, Cairo time. */
const FROM_HOUR = 10;
const UNTIL_HOUR = 19;
/** At most one of these to a person in this long. */
const GAP_MS = 2 * DAY;
/** At most this many in one sweep, so a backlog drains over a few sweeps. */
const PER_SWEEP = 200;
/** A "leads waiting" email can come back after this many days. */
const WAITING_PERIOD_DAYS = 14;

export type Candidate = { userId: string; email: string; name: string | null; lang: EmailLang } & EngagementData;
export const KINDS = ['verifyEmail', 'finishCard', 'shareCard', 'inviteTeam', 'leadsWaiting'] as const;
export type AnyKind = (typeof KINDS)[number];

type Row = { id: string; email: string; name: string | null; locale: string | null; alertLang: string | null };
const langOf = (r: Pick<Row, 'locale' | 'alertLang'>): EmailLang => ((r.locale ?? r.alertLang) === 'ar' ? 'ar' : 'en');

/**
 * Tips and reminders by email, the ones a person would want: confirm your
 * email, finish your card, share it, invite your team, and leads that are
 * waiting while you've been away. Each goes once (a waiting reminder at most
 * every two weeks), never more than one in two days, only in the working
 * day, in the person's language, and never to someone who turned them off.
 */
@Injectable()
export class EngagementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngagementService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @Optional() private readonly auth?: AuthService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private get zone() {
    return this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`engagement sweep failed: ${(e as Error).message}`)), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Unsubscribing, without signing in ──

  private secret() {
    const s = this.config.get<string>('JWT_SECRET');
    if (!s) throw new Error('JWT_SECRET is not set');
    return s;
  }

  /** A token for the "stop these emails" link: it can only turn tips off, for this person. */
  unsubscribeToken(userId: string): string {
    return createHmac('sha256', this.secret()).update(`tips-off:${userId}`).digest('base64url').slice(0, 32);
  }

  unsubscribeUrl(userId: string): string {
    const app = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    return `${app}/unsubscribe?u=${encodeURIComponent(userId)}&t=${this.unsubscribeToken(userId)}`;
  }

  async unsubscribe(userId: string, token: string): Promise<{ ok: true }> {
    const expected = Buffer.from(this.unsubscribeToken(userId));
    const given = Buffer.from(token ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new BadRequestException('This link isn’t valid');
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new BadRequestException('This link isn’t valid');
    await this.db.leadAlertSettings.upsert({ where: { userId }, create: { userId, tips: false }, update: { tips: false } });
    return { ok: true };
  }

  // ── Who gets what ──

  /** People who signed up a day or more ago and haven't confirmed their email. */
  private verifyCandidates(now: Date) {
    return this.db.$queryRaw<Row[]>`
      SELECT u.id, u.email, u.name, u.locale, s.lang AS "alertLang" FROM users u
      LEFT JOIN lead_alert_settings s ON s."userId" = u.id
      WHERE u."deletedAt" IS NULL AND u."emailVerified" IS NULL AND coalesce(s.tips, true)
        AND u."createdAt" BETWEEN ${new Date(now.getTime() - 7 * DAY)} AND ${new Date(now.getTime() - DAY)}`;
  }

  /** In a workspace for a day or more, with no published card. */
  private finishCandidates(now: Date) {
    return this.db.$queryRaw<(Row & { cardId: string | null })[]>`
      SELECT u.id, u.email, u.name, u.locale, s.lang AS "alertLang",
        (SELECT c.id FROM cards c WHERE c."ownerId" = u.id AND c."deletedAt" IS NULL ORDER BY c."createdAt" DESC LIMIT 1) AS "cardId"
      FROM users u LEFT JOIN lead_alert_settings s ON s."userId" = u.id
      WHERE u."deletedAt" IS NULL AND u."emailVerified" IS NOT NULL AND coalesce(s.tips, true)
        AND u."createdAt" BETWEEN ${new Date(now.getTime() - 14 * DAY)} AND ${new Date(now.getTime() - DAY)}
        AND EXISTS (SELECT 1 FROM memberships m JOIN organizations o ON o.id = m."orgId" WHERE m."userId" = u.id AND m.status = 'ACTIVE' AND o."deletedAt" IS NULL AND o."isActive")
        AND NOT EXISTS (SELECT 1 FROM cards c WHERE c."ownerId" = u.id AND c."isPublished" AND c."deletedAt" IS NULL)`;
  }

  /** A card published two days or more ago that nobody has opened. */
  private shareCandidates(now: Date) {
    return this.db.$queryRaw<(Row & { cardId: string })[]>`
      SELECT u.id, u.email, u.name, u.locale, s.lang AS "alertLang", c.id AS "cardId"
      FROM users u LEFT JOIN lead_alert_settings s ON s."userId" = u.id
      JOIN LATERAL (
        SELECT c.id FROM cards c WHERE c."ownerId" = u.id AND c."isPublished" AND c."deletedAt" IS NULL AND c."createdAt" < ${new Date(now.getTime() - 2 * DAY)}
        ORDER BY c."createdAt" ASC LIMIT 1
      ) c ON true
      WHERE u."deletedAt" IS NULL AND u."emailVerified" IS NOT NULL AND coalesce(s.tips, true)
        AND u."createdAt" > ${new Date(now.getTime() - 21 * DAY)}
        AND NOT EXISTS (SELECT 1 FROM events e JOIN cards c2 ON c2.id = e."cardId" WHERE c2."ownerId" = u.id AND e.type = 'VIEW')`;
  }

  /** The owner of a company workspace five days or more old, alone in it, with a live card. */
  private inviteCandidates(now: Date) {
    return this.db.$queryRaw<(Row & { orgName: string })[]>`
      SELECT DISTINCT ON (u.id) u.id, u.email, u.name, u.locale, s.lang AS "alertLang", o.name AS "orgName"
      FROM memberships m
      JOIN users u ON u.id = m."userId"
      JOIN organizations o ON o.id = m."orgId"
      LEFT JOIN lead_alert_settings s ON s."userId" = u.id
      WHERE m.role = 'OWNER' AND m.status = 'ACTIVE' AND o.kind = 'TEAM' AND o."deletedAt" IS NULL AND o."isActive"
        AND u."deletedAt" IS NULL AND u."emailVerified" IS NOT NULL AND coalesce(s.tips, true)
        AND o."createdAt" BETWEEN ${new Date(now.getTime() - 30 * DAY)} AND ${new Date(now.getTime() - 5 * DAY)}
        AND NOT EXISTS (SELECT 1 FROM memberships x WHERE x."orgId" = o.id AND x."userId" <> u.id AND x.status IN ('ACTIVE', 'INVITED'))
        AND EXISTS (SELECT 1 FROM cards c WHERE c."ownerId" = u.id AND c."orgId" = o.id AND c."isPublished" AND c."deletedAt" IS NULL)
      ORDER BY u.id, o."createdAt" DESC`;
  }

  /** Away a week or more, with leads from the last 30 days nobody has reached. */
  private waitingCandidates(now: Date) {
    return this.db.$queryRaw<(Row & { waiting: bigint; names: (string | null)[] })[]>`
      SELECT u.id, u.email, u.name, u.locale, s.lang AS "alertLang", count(l.id) AS waiting,
        (array_agg(l.name ORDER BY l."createdAt" DESC))[1:3] AS names
      FROM users u
      LEFT JOIN lead_alert_settings s ON s."userId" = u.id
      JOIN leads l ON (l."assignedTo" = u.id OR l."cardId" IN (SELECT c.id FROM cards c WHERE c."ownerId" = u.id))
      JOIN organizations o ON o.id = l."orgId" AND o."deletedAt" IS NULL AND o."isActive"
      WHERE u."deletedAt" IS NULL AND u."emailVerified" IS NOT NULL AND coalesce(s.tips, true)
        AND l."deletedAt" IS NULL AND l."firstContactedAt" IS NULL AND l."createdAt" > ${new Date(now.getTime() - 30 * DAY)}
        AND EXISTS (SELECT 1 FROM memberships m WHERE m."userId" = u.id AND m."orgId" = l."orgId" AND m.status = 'ACTIVE')
        AND (SELECT max(a."lastSeenAt") FROM auth_sessions a WHERE a."userId" = u.id) < ${new Date(now.getTime() - 7 * DAY)}
      GROUP BY u.id, u.email, u.name, u.locale, s.lang`;
  }

  /** Everyone due something now, by kind, in the order they should be considered. */
  async candidates(now = new Date()): Promise<{ kind: AnyKind; key: string; c: Candidate }[]> {
    const [verify, finish, share, invite, waiting] = await Promise.all([
      this.verifyCandidates(now),
      this.finishCandidates(now),
      this.shareCandidates(now),
      this.inviteCandidates(now),
      this.waitingCandidates(now),
    ]);
    const base = (r: Row) => ({ userId: r.id, email: r.email, name: r.name, lang: langOf(r) });
    const period = Math.floor(now.getTime() / (WAITING_PERIOD_DAYS * DAY));
    return [
      // What is waiting on them first: people, then the steps.
      ...waiting.map((r) => ({ kind: 'leadsWaiting' as const, key: `leadsWaiting:${period}`, c: { ...base(r), waiting: Number(r.waiting), names: r.names.filter((n): n is string => !!n) } })),
      ...verify.map((r) => ({ kind: 'verifyEmail' as const, key: 'verifyEmail', c: base(r) })),
      ...finish.map((r) => ({ kind: 'finishCard' as const, key: 'finishCard', c: { ...base(r), cardId: r.cardId } })),
      ...share.map((r) => ({ kind: 'shareCard' as const, key: 'shareCard', c: { ...base(r), cardId: r.cardId } })),
      ...invite.map((r) => ({ kind: 'inviteTeam' as const, key: 'inviteTeam', c: { ...base(r), orgName: r.orgName } })),
    ];
  }

  /** In the working day, sends each person at most one thing they're due and haven't had. Returns how many went. */
  async sweep(now = new Date(), opts: { anyHour?: boolean } = {}): Promise<number> {
    const hour = hourIn(this.zone, now);
    if (!opts.anyHour && (hour < FROM_HOUR || hour >= UNTIL_HOUR)) return 0;

    const due = await this.candidates(now);
    if (!due.length) return 0;
    const ids = [...new Set(due.map((d) => d.c.userId))];
    const past = await this.db.engagementEmail.findMany({ where: { userId: { in: ids } }, select: { userId: true, key: true, sentAt: true } });
    const had = new Set(past.map((p) => `${p.userId}|${p.key}`));
    const recent = new Set(past.filter((p) => p.sentAt.getTime() > now.getTime() - GAP_MS).map((p) => p.userId));

    let sent = 0;
    const done = new Set<string>();
    for (const d of due) {
      if (sent >= PER_SWEEP) break;
      const who = d.c.userId;
      if (done.has(who) || recent.has(who) || had.has(`${who}|${d.key}`)) continue;
      // Claimed before sending, so two servers can't both send it.
      try {
        await this.db.engagementEmail.create({ data: { userId: who, kind: d.kind, key: d.key, sentAt: now } });
      } catch {
        continue;
      }
      done.add(who);
      const ok = await this.send(d.kind, d.c).catch(() => false);
      if (ok) sent++;
    }
    if (sent) this.logger.log(`Sent ${sent} tip${sent === 1 ? '' : 's'} and reminders`);
    return sent;
  }

  private async send(kind: AnyKind, c: Candidate): Promise<boolean> {
    if (kind === 'verifyEmail') {
      // The confirmation email itself, with a fresh link.
      const r = await this.auth?.resendVerification(c.userId).catch(() => null);
      return !!r?.emailSent;
    }
    const app = this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000';
    return this.mail.send({
      to: c.email,
      subject: engagementSubject(kind, c, c.lang),
      html: engagementHtml(kind, c, c.lang, app, this.unsubscribeUrl(c.userId)),
    });
  }

  // ── For the people who run the platform ──

  /** How many of each went out in the last 30 days. */
  async stats(now = new Date()) {
    const rows = await this.db.engagementEmail.groupBy({ by: ['kind'], where: { sentAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _count: { _all: true } });
    const optedOut = await this.db.leadAlertSettings.count({ where: { tips: false } });
    return { sent: Object.fromEntries(KINDS.map((k) => [k, rows.find((r) => r.kind === k)?._count._all ?? 0])), optedOut };
  }

  /** A sample of one of them, to the admin's own address, in their language. */
  async preview(userId: string, kind: Exclude<AnyKind, 'verifyEmail'>, lang: EmailLang): Promise<{ sent: boolean }> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return { sent: false };
    const sample: Candidate = { userId, email: user.email, name: user.name, lang, cardId: null, orgName: 'Nile Co', waiting: 4, names: ['Mona Adel', 'Omar Saeed', 'Hana Fathy'] };
    const app = this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000';
    const sent = await this.mail.send({ to: user.email, subject: `[Preview] ${engagementSubject(kind, sample, lang)}`, html: engagementHtml(kind, sample, lang, app, this.unsubscribeUrl(userId)) });
    return { sent };
  }
}

export type { EngagementKind };
