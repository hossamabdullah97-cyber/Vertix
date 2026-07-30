import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  userId: string; // recipient
  orgId?: string | null;
  actorId?: string | null;
  type: string;
  category: string;
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The single, unified notification engine. Any module publishes notifications
 * through `notify()` / `notifyMany()`. Writes are best-effort — a failed
 * notification must never break the primary business action.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async notify(input: NotifyInput): Promise<void> {
    // Never notify a user about their own action.
    if (input.actorId && input.actorId === input.userId) return;
    // Respect the recipient's per-category in-app preference (default: on).
    if (!(await this.isInAppAllowed(input.userId, input.category))) return;
    try {
      await this.db.notification.create({
        data: {
          userId: input.userId,
          orgId: input.orgId ?? null,
          actorId: input.actorId ?? null,
          type: input.type,
          category: input.category,
          priority: input.priority ?? 'MEDIUM',
          title: input.title,
          body: input.body,
          metadata: input.metadata as never,
        },
      });
    } catch (err) {
      this.logger.warn(`notify failed (${input.type}): ${(err as Error).message}`);
    }
  }

  async notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
    await Promise.all([...new Set(userIds)].map((userId) => this.notify({ ...input, userId })));
  }

  /** Fan out an org-level event to every OWNER/ADMIN (except the actor). */
  async notifyOrgAdmins(orgId: string, actorId: string | null, input: Omit<NotifyInput, 'userId' | 'orgId' | 'actorId'>): Promise<void> {
    try {
      const admins = await this.db.membership.findMany({
        where: { orgId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
        select: { userId: true },
      });
      const ids = admins.map((a) => a.userId).filter((id) => id !== actorId);
      await this.notifyMany(ids, { ...input, orgId, actorId });
    } catch (err) {
      this.logger.warn(`notifyOrgAdmins failed (${input.type}): ${(err as Error).message}`);
    }
  }

  list(userId: string, opts: { category?: string; unread?: boolean; archived?: boolean; cursor?: string } = {}) {
    return this.db.notification.findMany({
      where: {
        userId,
        archivedAt: opts.archived ? { not: null } : null,
        ...(opts.unread ? { readAt: null } : {}),
        ...(opts.category ? { category: opts.category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      // Cursor pagination — the client passes the last id it received.
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      select: {
        id: true,
        type: true,
        category: true,
        priority: true,
        title: true,
        body: true,
        metadata: true,
        readAt: true,
        createdAt: true,
        orgId: true,
        actor: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
  }

  unreadCount(userId: string) {
    return this.db.notification.count({ where: { userId, readAt: null, archivedAt: null } });
  }

  // --- Per-category preferences (a missing row means "enabled") ---
  getPreferences(userId: string) {
    return this.db.notificationPreference.findMany({
      where: { userId },
      select: { category: true, inApp: true },
    });
  }

  async setPreference(userId: string, category: string, inApp: boolean) {
    await this.db.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, inApp },
      update: { inApp },
    });
    return { ok: true as const };
  }

  private async isInAppAllowed(userId: string, category: string): Promise<boolean> {
    try {
      const pref = await this.db.notificationPreference.findUnique({
        where: { userId_category: { userId, category } },
        select: { inApp: true },
      });
      return pref ? pref.inApp : true;
    } catch {
      return true; // never let a preference check block a notification
    }
  }

  async markRead(userId: string, id: string) {
    // updateMany scoped by userId → a user can only touch their own rows.
    await this.db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true as const };
  }

  async markUnread(userId: string, id: string) {
    await this.db.notification.updateMany({ where: { id, userId }, data: { readAt: null } });
    return { ok: true as const };
  }

  async markAllRead(userId: string) {
    await this.db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true as const };
  }

  async archive(userId: string, id: string) {
    await this.db.notification.updateMany({ where: { id, userId }, data: { archivedAt: new Date() } });
    return { ok: true as const };
  }
}
