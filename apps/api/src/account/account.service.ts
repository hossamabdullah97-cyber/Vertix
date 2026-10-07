import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { ADMIN_ORG, runWithTenant } from '@vertex/db';
import type { DeleteAccountInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { BillingService } from '../billing/billing.service';
import { TwoFactorService } from '../auth/two-factor.service';

export interface DeletionPreview {
  /** Workspaces only this person is in: deleted with the account (restorable for 30 days by support). */
  deletedWithIt: { id: string; name: string }[];
  /** Workspaces where they are the only owner and others remain: someone else must be made owner first. */
  blockers: { id: string; name: string; members: number }[];
  /** Workspaces they leave; their cards there are taken offline and their leads left unassigned. */
  leaving: { id: string; name: string; role: string }[];
  hasPassword: boolean;
  twoFactor: boolean;
}

/**
 * A person's own account, across every workspace they are in: a copy of what
 * is theirs, and closing it for good. Reads and writes here name the person
 * explicitly, so they run outside any one workspace's scope.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private unscoped<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return runWithTenant({ orgId: ADMIN_ORG, userId, role: 'OWNER' }, fn);
  }

  /** Everything stored about the person and by them, as one JSON document. */
  export(userId: string) {
    return this.unscoped(userId, async () => {
      const user = await this.db.user.findFirst({
        where: { id: userId },
        select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true, emailVerified: true, totpEnabledAt: true, googleId: true, appleId: true },
      });
      if (!user) throw new UnauthorizedException('Account not found');
      const [memberships, cards, leads, notifications, alerts, devices, phones] = await Promise.all([
        this.db.membership.findMany({
          where: { userId },
          select: { role: true, status: true, createdAt: true, org: { select: { id: true, name: true } } },
        }),
        this.db.card.findMany({
          where: { ownerId: userId },
          select: {
            id: true, slug: true, templateId: true, theme: true, vcardData: true, isPublished: true, createdAt: true, updatedAt: true,
            org: { select: { name: true } },
            sections: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
            actions: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
          },
        }),
        this.db.lead.findMany({
          where: { OR: [{ assignedTo: userId }, { card: { ownerId: userId } }] },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, name: true, email: true, phone: true, company: true, source: true, value: true, createdAt: true,
            firstContactedAt: true, lastContactedAt: true,
            org: { select: { name: true } },
            stage: { select: { name: true } },
            activities: { orderBy: { createdAt: 'asc' }, select: { type: true, metadata: true, createdAt: true } },
          },
        }),
        this.db.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 1000,
          select: { type: true, title: true, body: true, createdAt: true, readAt: true },
        }),
        this.db.leadAlertSettings.findUnique({ where: { userId } }),
        this.db.pushSubscription.count({ where: { userId } }),
        this.db.appPushToken.count({ where: { userId } }),
      ]);
      return {
        exportedAt: new Date().toISOString(),
        account: {
          id: user.id,
          email: user.email,
          name: user.name,
          photo: user.avatarUrl,
          createdAt: user.createdAt,
          emailConfirmedAt: user.emailVerified,
          signsInWithGoogle: !!user.googleId,
          signsInWithApple: !!user.appleId,
          twoStepVerificationSince: user.totpEnabledAt,
        },
        workspaces: memberships.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role, status: m.status, joinedAt: m.createdAt })),
        cards: cards.map(({ org, ...c }) => ({ workspace: org.name, ...c })),
        leads: leads.map(({ org, stage, ...l }) => ({ workspace: org.name, stage: stage?.name ?? null, ...l })),
        notifications,
        settings: { leadAlerts: alerts ? { ...alerts, id: undefined, userId: undefined } : null, devicesWithNotifications: devices, phonesWithNotifications: phones },
      };
    });
  }

  /** What closing the account would do, for the page to show before anyone confirms. */
  preview(userId: string): Promise<DeletionPreview> {
    return this.unscoped(userId, async () => {
      const user = await this.db.user.findFirst({ where: { id: userId }, select: { passwordHash: true, totpEnabledAt: true } });
      if (!user) throw new UnauthorizedException('Account not found');
      const memberships = await this.db.membership.findMany({
        where: { userId, status: { in: ['ACTIVE', 'SUSPENDED', 'INVITED'] }, org: { deletedAt: null } },
        select: { role: true, org: { select: { id: true, name: true } } },
      });
      const out: DeletionPreview = { deletedWithIt: [], blockers: [], leaving: [], hasPassword: !!user.passwordHash, twoFactor: !!user.totpEnabledAt };
      for (const m of memberships) {
        const others = await this.db.membership.count({ where: { orgId: m.org.id, userId: { not: userId }, status: { in: ['ACTIVE', 'INVITED', 'SUSPENDED'] } } });
        if (others === 0) {
          out.deletedWithIt.push(m.org);
          continue;
        }
        if (m.role === 'OWNER') {
          const otherOwners = await this.db.membership.count({ where: { orgId: m.org.id, userId: { not: userId }, role: 'OWNER', status: 'ACTIVE' } });
          if (otherOwners === 0) {
            out.blockers.push({ ...m.org, members: others });
            continue;
          }
        }
        out.leaving.push({ ...m.org, role: m.role });
      }
      return out;
    });
  }

  /**
   * Closes the account. The workspaces only they were in go with it (into the
   * usual 30-day restore window), they leave the others, and the account's
   * personal details are erased now, which also frees the address to sign up
   * again. Refused while they are the last owner of a workspace others use.
   */
  async delete(userId: string, input: DeleteAccountInput): Promise<{ ok: true; workspacesDeleted: number }> {
    const plan = await this.preview(userId);
    const user = await this.unscoped(userId, () =>
      this.db.user.findFirstOrThrow({ where: { id: userId }, select: { email: true, name: true, passwordHash: true, totpEnabledAt: true } }),
    );
    if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException('Type your email address exactly to confirm');
    }
    if (user.passwordHash && !(input.password && (await bcrypt.compare(input.password, user.passwordHash)))) {
      throw new UnauthorizedException('That password is not right');
    }
    if (user.totpEnabledAt) {
      if (!input.code) throw new BadRequestException('Enter a code from your authenticator app');
      await this.twoFactor.check(userId, input.code);
    }
    if (plan.blockers.length) {
      throw new BadRequestException(`Make someone else an owner of ${plan.blockers.map((b) => b.name).join(', ')} first, or remove its other members`);
    }

    const now = new Date();
    const solo = plan.deletedWithIt.map((o) => o.id);
    await this.unscoped(userId, () =>
      this.db.$transaction(async (tx) => {
        if (solo.length) await tx.organization.updateMany({ where: { id: { in: solo } }, data: { deletedAt: now } });
        // Leaving the shared ones: their cards go offline, their leads and chips are left for the team to hand out.
        await tx.card.updateMany({ where: { ownerId: userId, orgId: { notIn: solo } }, data: { isPublished: false } });
        await tx.lead.updateMany({ where: { assignedTo: userId }, data: { assignedTo: null } });
        await tx.task.updateMany({ where: { assignedTo: userId }, data: { assignedTo: null } });
        await tx.nfcTag.updateMany({ where: { assignedUserId: userId }, data: { assignedUserId: null } });
        await tx.membership.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
        await tx.pushSubscription.deleteMany({ where: { userId } });
        await tx.appPushToken.deleteMany({ where: { userId } });
        // Every device it was signed in on, with the addresses they came from.
        await tx.authSession.deleteMany({ where: { userId } });
        await tx.personalAccessToken.deleteMany({ where: { userId } });
        // Which account they were at their company's provider.
        await tx.ssoIdentity.deleteMany({ where: { userId } });
        await tx.leadAlertSettings.deleteMany({ where: { userId } });
        await tx.notificationPreference.deleteMany({ where: { userId } });
        await tx.notification.deleteMany({ where: { userId } });
        // What they used and which tips went to them: about a person, so it goes with them.
        await tx.activityDay.deleteMany({ where: { userId } });
        await tx.engagementEmail.deleteMany({ where: { userId } });
        // The record stays (audit trails point at it) without anything that identifies the person.
        await tx.user.update({
          where: { id: userId },
          data: {
            deletedAt: now,
            email: `deleted-${userId}@deleted.invalid`,
            name: null,
            avatarUrl: null,
            passwordHash: null,
            googleId: null,
            appleId: null,
            emailVerified: null,
            totpSecret: null,
            totpPendingSecret: null,
            totpEnabledAt: null,
            totpLastStep: null,
            totpRecoveryCodes: [],
          },
        });
      }),
    );
    for (const orgId of solo) {
      await this.unscoped(userId, () => this.billing.stopRenewals(orgId)).catch((e) => this.logger.warn(`Could not stop renewals for ${orgId}: ${(e as Error).message}`));
    }
    await this.mail
      .send({
        to: user.email,
        subject: 'Your Vertex Connect account has been deleted',
        html: `<p>Hi ${escapeHtml(user.name ?? '')},</p><p>Your Vertex Connect account (${escapeHtml(user.email)}) was deleted on ${now.toUTCString()}. ${
          solo.length ? `The workspace${solo.length === 1 ? '' : 's'} only you used ${solo.length === 1 ? 'is' : 'are'} kept for 30 days in case this was a mistake, then erased. ` : ''
        }If you didn't do this, reply to this email straight away.</p>`,
      })
      .catch(() => false);
    this.logger.log(`Account ${userId} deleted (${solo.length} workspace(s) with it)`);
    return { ok: true, workspacesDeleted: solo.length };
  }

  /** The language the app is used in, for emails sent unasked. */
  async setLanguage(userId: string, lang: 'en' | 'ar') {
    await this.prisma.client.user.update({ where: { id: userId }, data: { locale: lang } });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
