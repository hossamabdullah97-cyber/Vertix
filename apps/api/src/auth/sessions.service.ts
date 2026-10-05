import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deviceLabel } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/** Where a request came from, as the sign-in pages see it. */
export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

/** How long an unused device stays signed in; each renewal extends it. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a "still signed in" answer is trusted before asking the database again. */
const LIVE_CACHE_MS = 15_000;

/** lastSeenAt moves at most this often, so renewals are not a write each. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

function clip(value: string | null | undefined, max: number): string | null {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The devices a person is signed in on. Each sign-in starts one; its refresh
 * token renews only while it stands, and its access tokens are refused soon
 * after it is signed out (within LIVE_CACHE_MS on another server).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly live = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /**
   * A new signed-in device. A sign-in from a browser this account has not
   * used before is told to its owner by email, so one they did not make is
   * noticed. Signing up, the very first device, is not news.
   */
  async start(userId: string, client: ClientInfo = {}, opts: { announce?: boolean } = {}): Promise<string> {
    const userAgent = clip(client.userAgent, 512);
    const ip = clip(client.ip, 64);
    const label = deviceLabel(userAgent);
    let isNew = false;
    if (opts.announce) {
      const before = await this.db.authSession.findMany({ where: { userId }, select: { userAgent: true }, orderBy: { createdAt: 'desc' }, take: 50 });
      isNew = before.length > 0 && !before.some((s) => deviceLabel(s.userAgent) === label);
    }
    const session = await this.db.authSession.create({
      data: { userId, userAgent, ip, expiresAt: new Date(Date.now() + SESSION_IDLE_MS) },
      select: { id: true },
    });
    if (isNew) await this.announce(userId, label, ip);
    return session.id;
  }

  /**
   * Whether a refresh may renew this device, extending it if so. A device
   * that was signed out, has lapsed, or belongs to someone else may not.
   */
  async renew(sessionId: string, userId: string, client: ClientInfo = {}): Promise<boolean> {
    const s = await this.db.authSession.findUnique({ where: { id: sessionId }, select: { userId: true, revokedAt: true, expiresAt: true, lastSeenAt: true, ip: true } });
    if (!s || s.userId !== userId || s.revokedAt || s.expiresAt <= new Date()) return false;
    const ip = clip(client.ip, 64);
    const now = Date.now();
    // Kept alive at most once a few minutes, unless it has moved.
    if (now - s.lastSeenAt.getTime() > TOUCH_EVERY_MS || (ip && ip !== s.ip)) {
      await this.db.authSession.update({
        where: { id: sessionId },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_IDLE_MS), ...(ip ? { ip } : {}), ...(client.userAgent ? { userAgent: clip(client.userAgent, 512) } : {}) },
      });
    }
    return true;
  }

  /** For each request: whether the device its token names is still signed in. */
  async isLive(sessionId: string): Promise<boolean> {
    const at = this.live.get(sessionId);
    if (at && Date.now() - at < LIVE_CACHE_MS) return true;
    const s = await this.db.authSession.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } });
    const ok = !!s && !s.revokedAt && s.expiresAt > new Date();
    if (ok) {
      if (this.live.size > 10_000) this.live.clear();
      this.live.set(sessionId, Date.now());
    } else {
      this.live.delete(sessionId);
    }
    return ok;
  }

  /** The devices signed in now, the one asking first, then the most recently used. */
  async list(userId: string, currentId?: string) {
    const rows = await this.db.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
    return rows
      .map((r) => ({ ...r, current: r.id === currentId }))
      .sort((a, b) => Number(b.current) - Number(a.current));
  }

  /** Signs one of the person's own devices out. */
  async revoke(userId: string, sessionId: string): Promise<{ ok: true }> {
    const { count } = await this.db.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException('Session not found');
    this.live.delete(sessionId);
    return { ok: true };
  }

  /** Signs out every device but `keepId` (every one, when it is not given). */
  async revokeAll(userId: string, keepId?: string): Promise<{ count: number }> {
    const { count } = await this.db.authSession.updateMany({
      where: { userId, revokedAt: null, ...(keepId ? { id: { not: keepId } } : {}) },
      data: { revokedAt: new Date() },
    });
    this.live.clear();
    return { count };
  }

  private async announce(userId: string, label: string, ip: string | null) {
    if (!this.mail) return;
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return;
    const appUrl = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const when = new Date().toUTCString();
    await this.mail
      .send({
        to: user.email,
        subject: 'New sign-in to your Vertex Connect account',
        html:
          `<p>Hi ${escapeHtml(user.name ?? '')},</p>` +
          `<p>Your account (${escapeHtml(user.email)}) was just signed in to from a device it hasn't used before:</p>` +
          `<p><strong>${escapeHtml(label)}</strong><br/>${ip ? `IP address ${escapeHtml(ip)}<br/>` : ''}${escapeHtml(when)}</p>` +
          `<p>If this was you, there is nothing to do. If not, sign that device out from <a href="${appUrl}/account">your account page</a> and change your password.</p>`,
      })
      .catch((err) => {
        this.logger.warn(`New sign-in email not sent: ${(err as Error).message}`);
        return false;
      });
  }
}
