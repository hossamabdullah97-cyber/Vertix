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
   * Invites a member by email. Users who already hold an account are added
   * immediately and notified. Everyone else — a new address, or a placeholder
   * left by an invitation that was never accepted — gets a one-time link and
   * chooses their own password. Re-inviting resends that link.
   */
  async invite(tenant: TenantContext, input: InviteMemberInput) {
    if (input.teamId) await this.assertTeamInOrg(input.teamId);

    const existingUser = await this.db.user.findFirst({
      where: { email: input.email },
      select: { id: true, passwordHash: true },
    });

    // An account only counts as real once its owner has set a password. A row
    // with no passwordHash is a placeholder from an earlier invitation, so it
    // gets invited again rather than being treated as a joinable account —
    // otherwise it would land as ACTIVE with no way to ever sign in.
    const pendingMembership =
      existingUser && !existingUser.passwordHash
        ? await this.db.membership.findFirst({
            where: { userId: existingUser.id },
            select: { id: true },
          })
        : null;

    // Resending an invitation reuses the seat that invitation already holds,
    // so it must not be charged against the plan a second time.
    await this.limits.assertWithin(
      tenant.orgId,
      'members',
      pendingMembership ? 0 : 1,
    );

    const org = await this.db.organization.findUnique({
      where: { id: tenant.orgId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'your organization';
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');

    if (existingUser?.passwordHash) {
      const already = await this.db.membership.findFirst({
        where: { userId: existingUser.id },
      });
      if (already) throw new ConflictException('This user is already a member');

      await this.attachMembership(tenant, existingUser.id, {
        role: input.role,
        teamId: input.teamId,
        status: 'ACTIVE',
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

    // Pending invitee: reuse the placeholder account if one exists, otherwise
    // create it. Either way the membership stays INVITED and the employee sets
    // their own password through the emailed link.
    const user = existingUser
      ? await this.db.user.update({
          where: { id: existingUser.id },
          data: { ...(input.name ? { name: input.name } : {}) },
          select: { id: true },
        })
      : await this.db.user.create({
          data: { email: input.email, name: input.name },
          select: { id: true },
        });

    if (pendingMembership) {
      // Re-inviting: refresh the role/team the invitation grants.
      await this.db.membership.update({
        where: { id: pendingMembership.id },
        data: {
          role: input.role,
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
          status: 'INVITED',
        },
      });
      // A new link supersedes the old one, so retire any still-live invitation.
      await this.tokens.revokePending('INVITE', user.id);
    } else {
      await this.attachMembership(tenant, user.id, {
        role: input.role,
        teamId: input.teamId,
        status: 'INVITED',
      });
    }

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

  /**
   * Attaches a member, reviving whatever an earlier removal left behind. The
   * (userId, orgId) pair stays unique in the table even after a soft delete, so
   * a plain create would collide with that tombstone.
   */
  private async attachMembership(
    tenant: TenantContext,
    userId: string,
    data: {
      role: InviteMemberInput['role'];
      teamId?: string;
      status: 'ACTIVE' | 'INVITED';
    },
  ) {
    const removed = await this.db.membership.findFirst({
      where: { userId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!removed) {
      return this.db.membership.create({
        data: { orgId: tenant.orgId, userId, ...data },
      });
    }
    // The revived row starts clean: the old team and department belonged to the
    // membership that was removed, not to this new invitation.
    return this.db.membership.update({
      where: { id: removed.id },
      data: {
        role: data.role,
        teamId: data.teamId ?? null,
        departmentId: null,
        status: data.status,
        deletedAt: null,
      },
    });
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
