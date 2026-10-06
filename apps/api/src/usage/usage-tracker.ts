import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** The first part of an API path → the feature it belongs to; null counts only as "used the product". */
const FEATURE: Record<string, string | null> = {
  leads: 'leads',
  tasks: 'leads',
  'message-templates': 'leads',
  cards: 'cards',
  nfc: 'chips',
  analytics: 'analytics',
  reports: 'analytics',
  goals: 'analytics',
  orgs: 'team',
  invitations: 'team',
  integrations: 'integrations',
  webhooks: 'integrations',
  'api-keys': 'integrations',
  automations: 'integrations',
  'personal-tokens': 'integrations',
  billing: 'billing',
  notifications: 'notifications',
  support: 'help',
  account: null,
  auth: null,
  uploads: null,
};

export const USAGE_FEATURES = ['leads', 'cards', 'chips', 'analytics', 'team', 'integrations', 'billing', 'notifications', 'help'] as const;

/** "/api/leads/abc?x=1" → "leads"; undefined for paths that aren't someone using the product. */
export function featureOf(url: string): string | null | undefined {
  const seg = url.split('?')[0]!.replace(/^\/(api\/)?/, '').split('/')[0] ?? '';
  return seg in FEATURE ? FEATURE[seg] : undefined;
}

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Notes that a signed-in person used the product today, and which part of
 * it: one row per person, day and feature, written at most once per process
 * (a set in memory remembers what today already has). Calls made with an
 * API key, platform administration and public pages don't count.
 */
@Injectable()
export class UsageTracker implements NestInterceptor {
  private readonly logger = new Logger(UsageTracker.name);
  private seen = new Set<string>();
  private seenDay = '';

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<Request & { user?: { sub?: string }; apiAuth?: unknown }>();
      const userId = req.user?.sub;
      if (userId && !req.apiAuth && !userId.startsWith('apikey:')) {
        const feature = featureOf(req.originalUrl ?? req.url ?? '');
        if (feature !== undefined) this.note(userId, feature);
      }
    }
    return next.handle();
  }

  /** Records the day's use; never in the way of the request. */
  note(userId: string, feature: string | null, now = new Date()) {
    const day = dayOf(now);
    if (day !== this.seenDay) {
      this.seen = new Set();
      this.seenDay = day;
    }
    const rows = [{ userId, day, feature: '_' }, ...(feature ? [{ userId, day, feature }] : [])].filter((r) => !this.seen.has(`${r.userId}|${r.feature}`));
    if (!rows.length) return;
    for (const r of rows) this.seen.add(`${r.userId}|${r.feature}`);
    void this.prisma.client.activityDay.createMany({ data: rows, skipDuplicates: true }).catch((e) => {
      for (const r of rows) this.seen.delete(`${r.userId}|${r.feature}`);
      this.logger.warn(`usage note failed: ${(e as Error).message}`);
    });
  }
}
