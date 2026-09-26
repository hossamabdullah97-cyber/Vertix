import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { runWithTenant } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, type Plan, type Role } from '@vertex/shared';

/**
 * Runs tenant-scoped writes under the 'admin' bypass context so the Prisma
 * tenant extension does NOT inject the acting super-admin's own orgId. Platform
 * admin operations create rows for OTHER organizations, so the explicit orgId in
 * the payload must be preserved (the extension skips injection when orgId==='admin').
 */
function asPlatformAdmin<T>(actorId: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenant({ orgId: 'admin', userId: actorId, role: 'OWNER' }, fn);
}

// Memory store for dynamic feature flags & jobs for the demo.
let featureFlags = [
  { id: '1', name: 'NFC Lead Capture Direct Link', status: true, rollout: 100, targeting: 'All Users' },
  { id: '2', name: 'AI Business Insights Dashboard', status: true, rollout: 50, targeting: 'Pro & Enterprise' },
  { id: '3', name: 'Dynamic VCF Real-time Syncing', status: false, rollout: 0, targeting: 'Beta Group' },
  { id: '4', name: 'Premium Stripe Billing Portal', status: true, rollout: 100, targeting: 'All Users' },
];

let backgroundJobs = [
  { id: 'job_101', name: 'NFC Batch Generation (Batch B-2026)', status: 'COMPLETED', progress: 100, duration: '45s', worker: 'Worker #1', startedAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'job_102', name: 'Weekly Enterprise Analytics Aggregator', status: 'RUNNING', progress: 68, duration: '12m', worker: 'Worker #3', startedAt: new Date(Date.now() - 600000).toISOString() },
  { id: 'job_103', name: 'Stripe Webhook Sync (Failed Invoices)', status: 'FAILED', progress: 15, duration: '1.2s', worker: 'Worker #2', startedAt: new Date(Date.now() - 120000).toISOString(), error: 'Gateway timeout from Stripe API' },
  { id: 'job_104', name: 'Send Outbound Welcome Invitations', status: 'QUEUED', progress: 0, duration: '0s', worker: 'Pending', startedAt: new Date().toISOString() },
];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a platform-admin action.
   *
   * `orgId` must be the organization the action actually affected. Previously
   * this method resolved the non-null orgId FK with `findFirst()`, which wrote
   * every platform action into whichever organization happened to come back
   * first — an unrelated customer. That both corrupted the affected org's
   * trail (it got no record) and leaked platform activity into a tenant's own
   * audit view. A platform-wide action that belongs to no single organization
   * is recorded in the server log instead of being attributed to a tenant at
   * random; giving those a real home needs a nullable orgId (schema change).
   */
  async logAdminAction(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: any,
    orgId?: string,
  ) {
    if (!orgId) {
      this.logger.log(
        `[platform-admin] actor=${actorId} action=${action} target=${targetType}:${targetId} metadata=${JSON.stringify(metadata)}`,
      );
      return;
    }
    try {
      await this.prisma.client.auditLog.create({
        data: { orgId, actorId, action, targetType, targetId, metadata },
      });
    } catch (e) {
      this.logger.error(`Failed to log admin action: ${(e as Error).message}`);
    }
  }

  async createUser(data: { email: string; name?: string; password?: string; organizationName: string; isSuperAdmin?: boolean }, actorId: string) {
    const existing = await this.prisma.client.user.findFirst({
      where: { email: data.email },
    });
    if (existing) {
      throw new Error('Email is already in use');
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(data.password || 'Password123!', 10);

    // Bypass tenant orgId injection: this creates a NEW org's membership/stages,
    // not rows scoped to the acting admin's organization.
    const result = await asPlatformAdmin(actorId, () =>
      this.prisma.client.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: data.email,
            name: data.name || '',
            passwordHash,
            isSuperAdmin: data.isSuperAdmin || false,
          },
          // Never return passwordHash — this value is serialised to the client.
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isSuperAdmin: true,
            createdAt: true,
          },
        });

        const slug = data.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const org = await tx.organization.create({
          data: {
            name: data.organizationName,
            slug: `${slug}-${Math.random().toString(36).slice(2, 7)}`,
          },
        });

        await tx.membership.create({
          data: { userId: user.id, orgId: org.id, role: 'OWNER' },
        });

        // default stages
        const stages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
        await tx.pipelineStage.createMany({
          data: stages.map((name, order) => ({ orgId: org.id, name, order })),
        });

        return user;
      }),
    );

    await this.logAdminAction(actorId, 'CREATE_USER', 'User', result.id, { email: result.email });
    return result;
  }

  async getDashboardKPIs() {
    const [
      totalUsers,
      totalOrgs,
      totalCards,
      publishedCards,
      totalTags,
      activeTags,
      totalLeads,
      totalEvents,
    ] = await Promise.all([
      this.prisma.client.user.count({ where: { deletedAt: null } }),
      this.prisma.client.organization.count({ where: { deletedAt: null } }),
      this.prisma.client.card.count({ where: { deletedAt: null } }),
      this.prisma.client.card.count({ where: { deletedAt: null, isPublished: true } }),
      this.prisma.client.nfcTag.count({ where: { deletedAt: null } }),
      this.prisma.client.nfcTag.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.client.lead.count({ where: { deletedAt: null } }),
      this.prisma.client.event.count(),
    ]);

    // Users who actually hold an active membership somewhere.
    const activeUsers = await this.prisma.client.user.count({
      where: {
        deletedAt: null,
        memberships: { some: { status: 'ACTIVE' } },
      },
    });

    // Revenue from real subscriptions, priced from the shared plan table.
    // ENTERPRISE is quoted per contract, so its price is not known here — those
    // subscriptions are counted separately rather than guessed at.
    const activeSubs = await this.prisma.client.subscription.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { plan: true },
    });
    let mrr = 0;
    let enterpriseSubs = 0;
    for (const sub of activeSubs) {
      if (sub.plan === 'ENTERPRISE') enterpriseSubs += 1;
      else mrr += PLAN_LIMITS[sub.plan as Plan]?.price ?? 0;
    }
    const arr = mrr * 12;

    // Physical database size; null when the query is unavailable.
    let dbSize: string | null = null;
    try {
      const sizeResult = await this.prisma.client.$queryRawUnsafe<{ size: string }[]>(
        `SELECT pg_size_pretty(pg_database_size(current_database())) as size;`,
      );
      dbSize = sizeResult?.[0]?.size ?? null;
    } catch {
      dbSize = null;
    }

    return {
      totals: {
        users: totalUsers,
        activeUsers,
        organizations: totalOrgs,
        cards: totalCards,
        publishedCards,
        nfcDevices: totalTags,
        activeNfc: activeTags,
        leads: totalLeads,
        profileViews: totalEvents,
        mrr,
        arr,
        enterpriseSubs,
        dbSize,
      },
      system: {
        // Measured from this API process. CPU load and error rate are not
        // tracked anywhere yet, so they are absent rather than invented.
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
        activeJobs: backgroundJobs.filter((j) => j.status === 'RUNNING').length,
        failedJobs: backgroundJobs.filter((j) => j.status === 'FAILED').length,
      }
    };
  }

  async getUsers(search = '') {
    const searchFilter = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const users = await this.prisma.client.user.findMany({
      where: { deletedAt: null, ...searchFilter },
      include: {
        memberships: {
          include: {
            org: { select: { id: true, name: true, plan: true } }
          }
        },
        _count: {
          select: { ownedCards: true, assignedLeads: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      isSuperAdmin: u.isSuperAdmin,
      organizations: u.memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        role: m.role,
        status: m.status,
      })),
      cardsCount: u._count.ownedCards,
      leadsCount: u._count.assignedLeads,
    }));
  }

  async updateUserStatus(userId: string, status: string, actorId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (status === 'SUSPENDED' || status === 'ACTIVE') {
      await this.prisma.client.membership.updateMany({
        where: { userId },
        data: { status: status as any }
      });
    }

    await this.logAdminAction(actorId, `UPDATE_USER_STATUS_${status}`, 'User', userId, { previous: 'ACTIVE' });
    return { success: true };
  }

  async impersonateUser(userId: string, actorId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { memberships: true }
    });
    if (!user) throw new NotFoundException('User not found');

    await this.logAdminAction(actorId, 'IMPERSONATE_USER', 'User', userId, { email: user.email });
    return {
      userId: user.id,
      email: user.email,
      orgId: user.memberships[0]?.orgId,
      role: user.memberships[0]?.role,
    };
  }

  async getOrganizations(search?: string) {
    const searchFilter = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};

    const orgs = await this.prisma.client.organization.findMany({
      where: { deletedAt: null, ...searchFilter },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, email: true, name: true } }
          }
        },
        _count: {
          select: { cards: true, nfcTags: true, leads: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return orgs.map((o) => {
      const ownerMember = o.memberships.find((m) => m.role === 'OWNER');
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        plan: o.plan,
        isActive: o.isActive,
        createdAt: o.createdAt,
        owner: ownerMember ? { id: ownerMember.user.id, name: ownerMember.user.name, email: ownerMember.user.email } : null,
        membersCount: o.memberships.length,
        cardsCount: o._count.cards,
        nfcCount: o._count.nfcTags,
        leadsCount: o._count.leads,
      };
    });
  }

  private slugify(input: string): string {
    const base = input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 7);
    return `${base || 'org'}-${suffix}`;
  }

  async createOrganization(
    data: { name: string; plan?: string; ownerEmail: string; ownerName?: string; ownerPassword?: string },
    actorId: string,
  ) {
    // Ensure organization name is unique (case-insensitive check on active orgs)
    const existingOrg = await this.prisma.client.organization.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existingOrg) {
      throw new ConflictException('An organization with this name already exists.');
    }

    let user = await this.prisma.client.user.findFirst({
      where: { email: data.ownerEmail, deletedAt: null },
    });

    if (!user) {
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash(data.ownerPassword || 'Password123!', 10);
      user = await this.prisma.client.user.create({
        data: {
          email: data.ownerEmail,
          name: data.ownerName || '',
          passwordHash,
          isSuperAdmin: false,
        },
      });
    }

    const org = await this.prisma.client.organization.create({
      data: {
        name: data.name,
        slug: this.slugify(data.name),
        plan: (data.plan as any) || 'FREE',
        isActive: true,
      },
    });

    // Membership + pipeline stages are tenant-scoped; write them under the
    // 'admin' bypass so the extension keeps the NEW org's id (not the admin's).
    await asPlatformAdmin(actorId, async () => {
      await this.prisma.client.membership.create({
        data: {
          userId: user.id,
          orgId: org.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      const stages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
      await this.prisma.client.pipelineStage.createMany({
        data: stages.map((name, order) => ({ orgId: org.id, name, order })),
      });
    });

    await this.logAdminAction(actorId, 'CREATE_ORGANIZATION', 'Organization', org.id, {
      name: org.name,
      ownerEmail: user.email,
    }, org.id);
    return org;
  }

  async updateOrganizationStatus(orgId: string, isActive: boolean, actorId: string) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    await this.prisma.client.organization.update({
      where: { id: orgId },
      data: { isActive },
    });

    await this.logAdminAction(actorId, `UPDATE_ORG_STATUS_${isActive ? 'ACTIVE' : 'INACTIVE'}`, 'Organization', orgId, {
      previous: org.isActive,
    }, orgId);
    return { success: true };
  }

  async deleteOrganization(orgId: string, actorId: string) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    await this.prisma.client.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date() },
    });

    await this.logAdminAction(actorId, 'DELETE_ORGANIZATION', 'Organization', orgId, { name: org.name }, orgId);
    return { success: true };
  }

  async updateOrganizationOwner(
    orgId: string,
    data: { ownerEmail: string; ownerName?: string; ownerPassword?: string },
    actorId: string,
  ) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    let user = await this.prisma.client.user.findFirst({
      where: { email: data.ownerEmail, deletedAt: null },
    });

    if (!user) {
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash(data.ownerPassword || 'Password123!', 10);
      user = await this.prisma.client.user.create({
        data: {
          email: data.ownerEmail,
          name: data.ownerName || '',
          passwordHash,
          isSuperAdmin: false,
        },
      });
    }

    // Bypass tenant injection so membership writes target the SELECTED org,
    // not the acting admin's own organization.
    await asPlatformAdmin(actorId, () =>
      this.prisma.client.$transaction(async (tx) => {
        await tx.membership.updateMany({
          where: { orgId, role: 'OWNER' },
          data: { role: 'ADMIN' },
        });

        const existingMembership = await tx.membership.findUnique({
          where: { userId_orgId: { userId: user.id, orgId } },
        });

        if (existingMembership) {
          await tx.membership.update({
            where: { id: existingMembership.id },
            data: { role: 'OWNER', status: 'ACTIVE' },
          });
        } else {
          await tx.membership.create({
            data: {
              userId: user.id,
              orgId,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          });
        }
      }),
    );

    await this.logAdminAction(actorId, 'UPDATE_ORGANIZATION_OWNER', 'Organization', orgId, {
      ownerEmail: user.email,
    }, orgId);
    return { success: true };
  }

  async updateOrganizationPlan(orgId: string, plan: string, actorId: string) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    await this.prisma.client.organization.update({
      where: { id: orgId },
      data: { plan: plan as any }
    });

    // Also update Stripe subscription if it exists
    await this.prisma.client.subscription.updateMany({
      where: { orgId },
      data: { plan: plan as any }
    });

    await this.logAdminAction(actorId, `UPGRADE_ORG_PLAN_${plan}`, 'Organization', orgId, { oldPlan: org.plan }, orgId);
    return { success: true };
  }

  async getFeatureFlags() {
    return featureFlags;
  }

  async toggleFeatureFlag(flagId: string, actorId: string) {
    const flag = featureFlags.find((f) => f.id === flagId);
    if (!flag) throw new NotFoundException('Flag not found');

    flag.status = !flag.status;
    await this.logAdminAction(actorId, `TOGGLE_FEATURE_FLAG_${flag.name.toUpperCase().replace(/\s+/g, '_')}`, 'FeatureFlag', flagId, { status: flag.status });
    return flag;
  }

  async getQueueJobs() {
    return backgroundJobs;
  }

  async triggerJobAction(jobId: string, action: string, actorId: string) {
    const job = backgroundJobs.find((j) => j.id === jobId);
    if (!job) throw new NotFoundException('Job not found');

    if (action === 'RETRY') {
      job.status = 'RUNNING';
      job.progress = 5;
    } else if (action === 'CANCEL') {
      job.status = 'FAILED';
      job.error = 'Canceled by Administrator';
    } else if (action === 'PAUSE') {
      job.status = 'QUEUED';
    } else if (action === 'RESUME') {
      job.status = 'RUNNING';
    }

    await this.logAdminAction(actorId, `QUEUE_JOB_${action}_${jobId}`, 'BackgroundJob', jobId, { status: job.status });
    return job;
  }

  async getAuditLogs(search = '') {
    const logs = await this.prisma.client.auditLog.findMany({
      include: {
        actor: { select: { name: true, email: true, avatarUrl: true } },
        org: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      createdAt: l.createdAt,
      actor: l.actor ? { name: l.actor.name, email: l.actor.email } : null,
      orgName: l.org.name,
      metadata: l.metadata,
    }));
  }
}
