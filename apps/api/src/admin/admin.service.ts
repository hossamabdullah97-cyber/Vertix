import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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

/** Delivery states mapped onto the queue vocabulary the console renders. */
const WEBHOOK_STATUS: Record<string, string> = {
  PENDING: 'QUEUED',
  SUCCESS: 'COMPLETED',
  FAILED: 'FAILED',
};

/** The endpoint host is enough to identify a delivery target in a list. */
function hostOf(url?: string | null): string {
  if (!url) return '—';
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async logAdminAction(actorId: string, action: string, targetType: string, targetId: string, metadata: any) {
    try {
      // Find default organization for audit log tenant constraints
      const defaultOrg = await this.prisma.client.organization.findFirst({
        select: { id: true }
      });
      if (defaultOrg) {
        await this.prisma.client.auditLog.create({
          data: {
            orgId: defaultOrg.id,
            actorId,
            action,
            targetType,
            targetId,
            metadata,
          }
        });
      }
    } catch (e) {
      console.error('Failed to log admin action:', e);
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

    // Queue depth from the only real queue the platform runs: webhook delivery.
    const [activeJobs, failedJobs] = await Promise.all([
      this.prisma.client.webhookDelivery.count({ where: { status: 'PENDING' } }),
      this.prisma.client.webhookDelivery.count({ where: { status: 'FAILED' } }),
    ]);

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
        // Real queue depth: deliveries still owed a send, and ones that gave up.
        activeJobs,
        failedJobs,
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
    });
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
    });
    return { success: true };
  }

  async deleteOrganization(orgId: string, actorId: string) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    await this.prisma.client.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date() },
    });

    await this.logAdminAction(actorId, 'DELETE_ORGANIZATION', 'Organization', orgId, { name: org.name });
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
    });
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

    await this.logAdminAction(actorId, `UPGRADE_ORG_PLAN_${plan}`, 'Organization', orgId, { oldPlan: org.plan });
    return { success: true };
  }

  /**
   * Feature flags have no store and gate no behaviour anywhere in the product,
   * so there is nothing truthful to list. Returning an empty set lets the
   * console say so plainly instead of showing invented rows whose toggles
   * change nothing.
   */
  async getFeatureFlags() {
    return [];
  }

  async toggleFeatureFlag(flagId: string, _actorId: string) {
    throw new NotFoundException(`Feature flag ${flagId} not found`);
  }

  /**
   * Real background work, newest first. The platform's actual queues are
   * webhook deliveries (retried by WebhookDispatcher) and automation runs;
   * both are persisted, so the console reports them rather than a fixture.
   */
  async getQueueJobs() {
    const [deliveries, runs] = await Promise.all([
      this.prisma.client.webhookDelivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { endpoint: { select: { url: true } } },
      }),
      this.prisma.client.automationRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { automation: { select: { name: true } } },
      }),
    ]);

    const jobs = [
      ...deliveries.map((d) => ({
        id: `webhook:${d.id}`,
        name: `Webhook · ${d.event}`,
        status: WEBHOOK_STATUS[d.status] ?? 'QUEUED',
        // A delivery is all-or-nothing; attempts are the only progress it has.
        progress: d.status === 'SUCCESS' ? 100 : 0,
        attempts: `${d.attempts}/${d.maxAttempts}`,
        durationMs: d.durationMs,
        worker: hostOf(d.endpoint?.url),
        startedAt: d.createdAt.toISOString(),
        error: d.error ?? undefined,
        /** Only failed deliveries can be re-queued. */
        retryable: d.status === 'FAILED',
      })),
      ...runs.map((r) => ({
        id: `automation:${r.id}`,
        name: `Automation · ${r.automation?.name ?? r.event}`,
        status: r.status === 'SUCCESS' ? 'COMPLETED' : r.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
        progress: 100,
        attempts: `${r.actionsRun}`,
        durationMs: null,
        worker: r.event,
        startedAt: r.createdAt.toISOString(),
        error: r.error ?? undefined,
        retryable: false,
      })),
    ];

    return jobs
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 25);
  }

  /**
   * Re-queues a failed webhook delivery. Everything else is a historical record
   * with nothing to act on, so it is refused rather than acknowledged — the
   * previous version reported success for actions it never performed.
   */
  async triggerJobAction(jobId: string, action: string, actorId: string) {
    const [kind, id] = jobId.split(':');

    if (kind !== 'webhook' || action !== 'RETRY') {
      throw new ConflictException(
        'Only a failed webhook delivery can be retried; automation runs are a historical record.',
      );
    }

    const delivery = await this.prisma.client.webhookDelivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'FAILED') {
      throw new ConflictException('Only a failed delivery can be retried.');
    }

    // The dispatcher picks up anything PENDING whose nextAttemptAt has passed.
    const updated = await this.prisma.client.webhookDelivery.update({
      where: { id },
      data: { status: 'PENDING', nextAttemptAt: new Date(), error: null },
    });

    await this.logAdminAction(actorId, `WEBHOOK_DELIVERY_RETRY`, 'WebhookDelivery', id, {
      event: updated.event,
    });
    return { id: jobId, status: 'QUEUED' };
  }

  /** Platform-wide NFC stock, newest first, with the org each tag belongs to. */
  async getNfcTags() {
    const tags = await this.prisma.client.nfcTag.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { org: { select: { name: true } } },
    });

    return tags.map((tag) => ({
      id: tag.id,
      uid: tag.uid,
      status: tag.status,
      hardwareType: tag.hardwareType,
      batchId: tag.batchId,
      activationCount: tag.activationCount,
      lastScanAt: tag.lastScanAt?.toISOString() ?? null,
      orgName: tag.org?.name ?? '—',
      assigned: tag.cardId !== null,
    }));
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
