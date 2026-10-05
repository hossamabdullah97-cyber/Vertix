import { Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_ORG, runWithTenant, type TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhookService } from '../integrations/webhook.service';

export const INVITATION_CLOSED = 'This invitation is no longer open.';

/**
 * The invitations waiting on the signed-in person: a workspace that asked
 * them to join. They join only by accepting; declining leaves no trace in
 * that workspace beyond its log.
 *
 * Runs across workspaces: the person is not in the inviting one yet, and the
 * request may come from any other.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhookService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /**
   * Runs fn outside the request's workspace. fn must await its queries: a
   * Prisma query only runs when awaited, and one merely returned would run
   * after this has ended, back in the request's workspace.
   */
  private across<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return runWithTenant({ orgId: ADMIN_ORG, userId, role: 'OWNER' }, fn);
  }

  list(userId: string) {
    return this.across(userId, async () => {
      const rows = await this.db.membership.findMany({
        where: { userId, status: 'INVITED', org: { deletedAt: null, isActive: true } },
        select: { role: true, updatedAt: true, org: { select: { id: true, name: true, slug: true, kind: true, branding: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      return rows.map((r) => ({ org: r.org, role: r.role, invitedAt: r.updatedAt }));
    });
  }

  async accept(userId: string, orgId: string) {
    const { membership, who } = await this.open(userId, orgId);
    await this.across(userId, async () => {
      await this.db.membership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } });
    });
    await this.answered(userId, orgId);
    const tenant: TenantContext = { orgId, userId, role: membership.role };
    await runWithTenant(tenant, async () => {
      await this.audit.log(tenant, 'member.joined', { targetType: 'user', targetId: userId, metadata: { email: who.email, role: membership.role } });
      await this.notifications.notifyOrgAdmins(orgId, userId, {
        type: 'member.joined',
        category: 'ORGANIZATION',
        priority: 'MEDIUM',
        title: 'A new member joined',
        body: who.name || who.email,
        metadata: { role: membership.role, email: who.email },
      });
    });
    void this.webhooks.emit(orgId, 'member.added', { userId, email: who.email, role: membership.role }).catch(() => undefined);
    return { orgId, role: membership.role };
  }

  async decline(userId: string, orgId: string) {
    const { membership, who } = await this.open(userId, orgId);
    await this.across(userId, async () => {
      await this.db.membership.softDelete({ id: membership.id });
    });
    await this.answered(userId, orgId);
    const tenant: TenantContext = { orgId, userId, role: membership.role };
    await runWithTenant(tenant, async () => {
      await this.audit.log(tenant, 'member.declined', { targetType: 'user', targetId: userId, metadata: { email: who.email, role: membership.role } });
      await this.notifications.notifyOrgAdmins(orgId, userId, {
        type: 'member.declined',
        category: 'ORGANIZATION',
        priority: 'LOW',
        title: 'An invitation was declined',
        body: who.name || who.email,
        metadata: { email: who.email },
      });
    });
    return { orgId, declined: true };
  }

  /** An answered invitation's notification has nothing more to ask. */
  private async answered(userId: string, orgId: string) {
    await this.db.notification
      .updateMany({ where: { userId, type: 'member.invited', readAt: null, metadata: { path: ['orgId'], equals: orgId } }, data: { readAt: new Date() } })
      .catch(() => undefined);
  }

  private open(userId: string, orgId: string) {
    return this.across(userId, async () => {
      const membership = await this.db.membership.findFirst({
        where: { userId, orgId, status: 'INVITED', org: { deletedAt: null, isActive: true } },
        select: { id: true, role: true },
      });
      if (!membership) throw new NotFoundException(INVITATION_CLOSED);
      const who = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
      return { membership, who };
    });
  }
}
