import { Injectable, Logger, NotFoundException, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as Sentry from '@sentry/node';
import type { ClientErrorInput, ErrorGroupView } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/** Groups kept: past this, only errors already known are counted (a flood cannot fill the table). */
export const MAX_GROUPS = 5000;
/** Groups not seen for this long are dropped by the daily sweep. */
const KEEP_DAYS = 90;
/** People remembered per group, to count how many it reached. */
const MAX_USERS = 50;
/** One alert per group per hour, however often it happens. */
const ALERT_EVERY_MS = 60 * 60_000;

/**
 * The message with what changes between occurrences taken out (numbers, ids,
 * quoted values, addresses), so "Card 42 not found" and "Card 77 not found"
 * are one error.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/["'`][^"'`]{1,80}["'`]/g, '<value>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>')
    .replace(/\bc[a-z0-9]{20,}\b/g, '<id>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .trim()
    .slice(0, 300);
}

/**
 * Where an error was thrown: the first frame of its stack that is the app's
 * own, without line numbers or the build's content hashes, so the same bug
 * in the next release is still the same group.
 */
export function topFrame(stack: string | undefined): string {
  if (!stack) return '';
  for (const raw of stack.split('\n').slice(0, 15)) {
    const line = raw.trim();
    if (!/^at |@/.test(line) && !line.includes('/')) continue;
    if (/node_modules|chrome-extension:|moz-extension:|<anonymous>/.test(line)) continue;
    return line
      .replace(/\?[^\s):]*/g, '')
      .replace(/:\d+(:\d+)?\)?$/g, '')
      .replace(/[-.][0-9a-f]{8,}(?=\.js)/gi, '')
      .replace(/https?:\/\/[^/\s]+/g, '')
      .slice(0, 200);
  }
  return '';
}

export function fingerprint(source: 'BROWSER' | 'API', name: string, message: string, where: string): string {
  return createHash('sha1').update([source, name, normalizeMessage(message), where].join('|')).digest('hex');
}

/** Noise no fix on our side would remove: extensions, cross-origin scripts, cancelled requests. */
export function isNoise(input: Pick<ClientErrorInput, 'name' | 'message' | 'stack'>): boolean {
  const m = input.message;
  return (
    !m ||
    m === 'Script error.' ||
    /ResizeObserver loop/.test(m) ||
    input.name === 'AbortError' ||
    /chrome-extension:|moz-extension:|safari-web-extension:/.test(input.stack ?? '')
  );
}

/** A page path with nothing after it that could carry a token or an email. */
export function cleanPath(path: string | undefined | null): string | null {
  if (!path) return null;
  return path.split(/[?#]/)[0]!.slice(0, 300) || null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Occurrence = {
  source: 'BROWSER' | 'API';
  kind: string;
  name: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  userAgent?: string | null;
  release?: string | null;
  userId?: string | null;
};

/**
 * Errors from the browser and the API, grouped so the admin console shows
 * each bug once, with how often and to how many people it happened. A new
 * error, or one marked fixed that comes back, is emailed to OPS_ALERT_EMAIL.
 * Sentry, when SENTRY_DSN is set, gets the browser's errors too.
 */
@Injectable()
export class ErrorsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrorsService.name);
  private readonly alerted = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: MailService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`error sweep failed: ${(e as Error).message}`)), 24 * 60 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get db() {
    return this.prisma.client;
  }

  /** An error a browser reported. */
  async fromBrowser(input: ClientErrorInput, ctx: { userAgent?: string | null; userId?: string | null }): Promise<void> {
    if (isNoise(input)) return;
    if (this.config.get<string>('SENTRY_DSN')) {
      Sentry.withScope((scope) => {
        scope.setTag('source', 'browser');
        scope.setTag('kind', input.kind);
        if (input.release) scope.setTag('release', input.release);
        if (ctx.userId) scope.setUser({ id: ctx.userId });
        scope.setExtras({ path: cleanPath(input.path), stack: input.stack, userAgent: ctx.userAgent });
        Sentry.captureMessage(`${input.name}: ${input.message}`, 'error');
      });
    }
    await this.record({ source: 'BROWSER', kind: input.kind, name: input.name, message: input.message, stack: input.stack, path: input.path, release: input.release, ...ctx });
  }

  /** An API request that failed on our side (5xx). Best-effort: never adds to the failure. */
  async fromServer(err: unknown, route: string | null, userId?: string | null): Promise<void> {
    const e = err instanceof Error ? err : new Error(String(err));
    await this.record({ source: 'API', kind: 'server', name: e.name, message: e.message || 'Unknown error', stack: e.stack, path: route, userId }).catch((x) =>
      this.logger.warn(`could not record a server error: ${(x as Error).message}`),
    );
  }

  async record(o: Occurrence): Promise<void> {
    const name = (o.name || 'Error').slice(0, 120);
    const message = (o.message || '').slice(0, 1000);
    const where = o.source === 'API' ? `${o.path ?? ''} ${topFrame(o.stack ?? undefined)}` : topFrame(o.stack ?? undefined);
    const fp = fingerprint(o.source, name, message, where);
    const sample = {
      stack: o.stack?.slice(0, 8000) ?? null,
      path: cleanPath(o.path),
      userAgent: o.userAgent?.slice(0, 300) ?? null,
      release: o.release?.slice(0, 80) ?? null,
    };

    const known = await this.db.errorGroup.findUnique({ where: { fingerprint: fp }, select: { id: true, resolvedAt: true, userIds: true } });
    if (known) {
      const userIds = o.userId && !known.userIds.includes(o.userId) && known.userIds.length < MAX_USERS ? [...known.userIds, o.userId] : undefined;
      await this.db.errorGroup.update({
        where: { id: known.id },
        data: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, ...sample, ...(userIds ? { userIds } : {}) },
      });
      if (known.resolvedAt) await this.alert(fp, 'back', { ...o, name, message, path: sample.path });
      return;
    }
    if ((await this.db.errorGroup.count()) >= MAX_GROUPS) return;
    try {
      await this.db.errorGroup.create({
        data: { fingerprint: fp, source: o.source, kind: o.kind, name, message, ...sample, userIds: o.userId ? [o.userId] : [] },
      });
    } catch {
      // Two at once: the other made the group; counting this one is not worth a retry.
      return;
    }
    await this.alert(fp, 'new', { ...o, name, message, path: sample.path });
  }

  /** Errors, the ones still open first, then by when they last happened. */
  async list(filter: { source?: string; status?: string } = {}): Promise<ErrorGroupView[]> {
    const rows = await this.db.errorGroup.findMany({
      where: {
        ...(filter.source === 'BROWSER' || filter.source === 'API' ? { source: filter.source } : {}),
        ...(filter.status === 'resolved' ? { resolvedAt: { not: null } } : filter.status === 'all' ? {} : { resolvedAt: null }),
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      kind: r.kind,
      name: r.name,
      message: r.message,
      stack: r.stack,
      path: r.path,
      userAgent: r.userAgent,
      release: r.release,
      count: r.count,
      users: r.userIds.length,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }

  /** Marks an error fixed, or open again. */
  async setResolved(id: string, resolved: boolean) {
    const { count } = await this.db.errorGroup.updateMany({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
    if (!count) throw new NotFoundException('Error not found');
    return { ok: true };
  }

  /** Drops errors nobody has met for three months. */
  async sweep(now = new Date()): Promise<number> {
    const { count } = await this.db.errorGroup.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } } });
    return count;
  }

  private async alert(fp: string, why: 'new' | 'back', o: Occurrence) {
    const to = this.config.get<string>('OPS_ALERT_EMAIL')?.trim();
    if (!to || !this.mail) return;
    const last = this.alerted.get(fp);
    if (last && Date.now() - last < ALERT_EVERY_MS) return;
    this.alerted.set(fp, Date.now());
    if (this.alerted.size > 2000) this.alerted.clear();
    const appUrl = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const where = o.source === 'API' ? 'API' : 'browser';
    await this.mail
      .send({
        to,
        subject: `[Vertex ${where}] ${why === 'new' ? 'New error' : 'Error is back'}: ${o.name}: ${o.message}`.slice(0, 200),
        html:
          `<p><strong>${escapeHtml(o.name)}: ${escapeHtml(o.message)}</strong></p>` +
          `<p>${why === 'new' ? 'First seen' : 'Marked fixed, and seen again'} just now in the ${where}${o.path ? ` on <code>${escapeHtml(o.path)}</code>` : ''}.</p>` +
          (o.stack ? `<pre style="font-size:12px;white-space:pre-wrap">${escapeHtml(o.stack.slice(0, 2000))}</pre>` : '') +
          `<p><a href="${appUrl}/admin?tab=errors">Open the errors in the admin console</a></p>`,
      })
      .catch(() => false);
  }
}
