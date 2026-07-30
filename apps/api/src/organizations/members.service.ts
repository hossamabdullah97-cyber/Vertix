import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import type { InviteMemberInput, UpdateMemberInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LimitsService } from '../billing/limits.service';
import { TokensService } from '../mail/tokens.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhookService } from '../integrations/webhook.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhookService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  list() {
    // orgId auto-injected by the tenant extension.
    return this.db.membership.findMany({
      select: {
        id: true,
        role: true,
        status: true,
        teamId: true,
        departmentId: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        team: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Invites a member by email. Existing users are added immediately and notified.
   * New users get an invitation email with a one-time link to set their password.
   */
  async invite(tenant: TenantContext, input: InviteMemberInput) {
    await this.limits.assertWithin(tenant.orgId, 'members');
    if (input.teamId) await this.assertTeamInOrg(input.teamId);

    const org = await this.db.organization.findUnique({
      where: { id: tenant.orgId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'your organization';
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');

    const existingUser = await this.db.user.findFirst({
      where: { email: input.email },
    });

    if (existingUser) {
      const already = await this.db.membership.findFirst({
        where: { userId: existingUser.id },
      });
      if (already) throw new ConflictException('This user is already a member');

      await this.db.membership.create({
        data: {
          orgId: tenant.orgId,
          userId: existingUser.id,
          role: input.role,
          teamId: input.teamId,
          status: 'ACTIVE',
        },
      });
      await this.mail.sendAddedNotice(input.email, orgName);
      await this.audit.log(tenant, 'member.added', { targetType: 'user', targetId: existingUser.id, metadata: { email: input.email, role: input.role } });
      await this.notifications.notify({
        userId: existingUser.id,
        orgId: tenant.orgId,
        actorId: tenant.userId,
        type: 'member.added',
        category: 'ORGANIZATION',
        priority: 'MEDIUM',
        title: `You were added to ${orgName}`,
        body: `Role: ${input.role}`,
        metadata: { role: input.role },
      });
      void this.webhooks
        .emit(tenant.orgId, 'member.added', {
          userId: existingUser.id,
          email: input.email,
          role: input.role,
        })
        .catch(() => undefined);
      return { status: 'added' as const, email: input.email };
    }

    // New user: create a pending account + INVITED membership, then email a link.
    const user = await this.db.user.create({
      data: { email: input.email, name: input.name },
    });
    await this.db.membership.create({
      data: {
        orgId: tenant.orgId,
        userId: user.id,
        role: input.role,
        teamId: input.teamId,
        status: 'INVITED',
      },
    });
    const token = await this.tokens.create({
      type: 'INVITE',
      email: input.email,
      userId: user.id,
      orgId: tenant.orgId,
      role: input.role,
      teamId: input.teamId,
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    await this.mail.sendInvite(
      input.email,
      `${appUrl}/accept-invite?token=${token}`,
      orgName,
      input.role,
    );
    await this.audit.log(tenant, 'member.invited', { targetType: 'user', targetId: user.id, metadata: { email: input.email, role: input.role } });
    return { status: 'invited' as const, email: input.email };
  }

  async update(tenant: TenantContext, id: string, input: UpdateMemberInput) {
    const target = await this.db.membership.findFirst({ where: { id } });
    if (!target) throw new NotFoundException('Member not found');

    // Only an OWNER can modify another OWNER.
    if (target.role === 'OWNER' && tenant.role !== 'OWNER') {
      throw new ForbiddenException('Only an owner can modify an owner');
    }

    // Prevent demoting the last owner.
    if (input.role && input.role !== 'OWNER' && target.role === 'OWNER') {
      await this.assertNotLastOwner();
    }
    if (input.teamId) await this.assertTeamInOrg(input.teamId);

    // Owners cannot be suspended (protects account access).
    if (input.status === 'SUSPENDED' && target.role === 'OWNER') {
      throw new ForbiddenException('Owners cannot be suspended');
    }

    const updated = await this.db.membership.update({
      where: { id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      select: { id: true, role: true, teamId: true, departmentId: true, status: true },
    });

    // Log the most specific action for a clean audit trail.
    const action =
      input.status === 'SUSPENDED' ? 'member.suspended'
      : input.status === 'ACTIVE' ? 'member.reactivated'
      : input.role ? 'member.role_changed'
      : 'member.team_changed';
    await this.audit.log(tenant, action, { targetType: 'membership', targetId: id, metadata: { role: input.role, status: input.status, teamId: input.teamId } });

    // Notify the affected member about role/status changes (not team moves).
    if (input.status || input.role) {
      await this.notifications.notify({
        userId: target.userId,
        orgId: tenant.orgId,
        actorId: tenant.userId,
        type: action,
        category: input.status ? 'SECURITY' : 'ORGANIZATION',
        priority: input.status === 'SUSPENDED' ? 'HIGH' : 'MEDIUM',
        title:
          input.status === 'SUSPENDED' ? 'Your access was suspended'
          : input.status === 'ACTIVE' ? 'Your access was reactivated'
          : `Your role is now ${input.role}`,
        metadata: { role: input.role, status: input.status },
      });
    }
    return updated;
  }

  async remove(tenant: TenantContext, id: string) {
    const target = await this.db.membership.findFirst({ where: { id } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.userId === tenant.userId) {
      throw new BadRequestException('You cannot remove yourself');
    }
    if (target.role === 'OWNER') {
      if (tenant.role !== 'OWNER') {
        throw new ForbiddenException('Only an owner can remove an owner');
      }
      await this.assertNotLastOwner();
    }
    const removed = await this.db.user.findUnique({ where: { id: target.userId }, select: { name: true, email: true } });
    await this.db.membership.softDelete({ id });
    await this.audit.log(tenant, 'member.removed', { targetType: 'membership', targetId: id, metadata: { role: target.role } });
    await this.notifications.notifyOrgAdmins(tenant.orgId, tenant.userId, {
      type: 'member.removed',
      category: 'ORGANIZATION',
      priority: 'MEDIUM',
      title: 'A member was removed',
      body: removed?.name || removed?.email || undefined,
      metadata: { role: target.role, email: removed?.email },
    });
    return { id, removed: true };
  }

  private async assertNotLastOwner() {
    const owners = await this.db.membership.count({ where: { role: 'OWNER' } });
    if (owners <= 1) {
      throw new BadRequestException('The organization must keep at least one owner');
    }
  }

  private async assertTeamInOrg(teamId: string) {
    const team = await this.db.team.findFirst({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
  }
}
