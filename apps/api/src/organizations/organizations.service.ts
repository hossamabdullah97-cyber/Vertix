import { BadRequestException, Injectable } from '@nestjs/common';
import { ADMIN_ORG, runWithTenant } from '@vertex/db';
import { defaultStageRows, type UpdateOrgInput } from '@vertex/shared';
import { workspaceSlug } from '../common/workspace-slug';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every workspace the person is in, whichever one the request came from. */
  listForUser(userId: string) {
    return runWithTenant({ orgId: ADMIN_ORG, userId, role: 'OWNER' }, () => this.memberships(userId));
  }

  private async memberships(userId: string) {
    const memberships = await this.prisma.client.membership.findMany({
      where: { userId, status: 'ACTIVE', org: { deletedAt: null } },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
            branding: true,
            kind: true,
          },
        },
      },
    });
    return memberships.map((m) => ({
      org: m.org,
      role: m.role,
    }));
  }

  getCurrent(orgId: string) {
    // Organization is not a tenant-scoped table — query by id explicitly.
    return this.prisma.client.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, plan: true, kind: true, branding: true, settings: true },
    });
  }

  /**
   * Makes a person's own workspace a company's or team's: same cards, leads
   * and chips, now with a team to invite. Only the owner, and only one way.
   */
  async convertToTeam(orgId: string, name: string) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId }, select: { kind: true } });
    if (org?.kind !== 'PERSONAL') throw new BadRequestException('This is already a company or team workspace.');
    return this.prisma.client.organization.update({
      where: { id: orgId },
      data: { kind: 'TEAM', name: name.trim() },
      select: { id: true, name: true, slug: true, plan: true, kind: true, branding: true, settings: true },
    });
  }

  /**
   * A personal workspace for someone who only has their company's: their own
   * card, outside the company. One each.
   */
  async createPersonal(userId: string) {
    // Across workspaces: the request runs in the company's, whose scope would
    // both hide a personal workspace held elsewhere and rewrite the new
    // membership into the company.
    return runWithTenant({ orgId: ADMIN_ORG, userId, role: 'OWNER' }, () => this.makePersonal(userId));
  }

  private async makePersonal(userId: string) {
    const owned = await this.prisma.client.membership.findFirst({
      where: { userId, role: 'OWNER', status: 'ACTIVE', org: { kind: 'PERSONAL', deletedAt: null } },
      select: { orgId: true },
    });
    if (owned) throw new BadRequestException('You already have a personal workspace.');
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    const name = user?.name?.trim() || user?.email.split('@')[0] || 'Personal';
    return this.prisma.client.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name, slug: workspaceSlug(name), kind: 'PERSONAL' }, select: { id: true, name: true, slug: true, kind: true } });
      await tx.membership.create({ data: { userId, orgId: org.id, role: 'OWNER' } });
      await tx.pipelineStage.createMany({ data: defaultStageRows(org.id) });
      return org;
    });
  }

  /** Update the active org's profile / branding. Scoped by the caller to the
   *  active org id (from @OrgId), which the TenantGuard has already verified. */
  async updateCurrent(orgId: string, input: UpdateOrgInput) {
    // Settings are laid over the stored ones, so saving one setting (the
    // language, the privacy link) never erases the others.
    let settings: Record<string, unknown> | undefined;
    if (input.settings) {
      const current = await this.prisma.client.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
      const stored = current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings) ? (current.settings as Record<string, unknown>) : {};
      // Whether members need two-step verification is changed only through
      // updateSecurity, which checks the person changing it has it.
      const { require2fa: _ignored, ...rest } = input.settings;
      settings = { ...stored, ...rest };
    }
    return this.prisma.client.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.branding !== undefined ? { branding: (input.branding ?? undefined) as never } : {}),
        ...(input.settings !== undefined ? { settings: (settings ?? undefined) as never } : {}),
      },
      select: { id: true, name: true, slug: true, plan: true, kind: true, branding: true, settings: true },
    });
  }

  /** Whether two-step verification is required here, and the active members still without it. */
  async security(orgId: string) {
    const [org, without] = await Promise.all([
      this.prisma.client.organization.findUnique({ where: { id: orgId }, select: { settings: true } }),
      this.prisma.client.membership.findMany({
        where: { orgId, status: 'ACTIVE', user: { deletedAt: null, totpEnabledAt: null } },
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    return {
      require2fa: settings.require2fa === true,
      membersWithout: without.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
    };
  }

  /** Requiring it is for someone who uses it themselves, so no one locks themselves out. */
  async updateSecurity(orgId: string, actorId: string, require2fa: boolean) {
    if (require2fa) {
      const actor = await this.prisma.client.user.findUnique({ where: { id: actorId }, select: { totpEnabledAt: true } });
      if (!actor?.totpEnabledAt) throw new BadRequestException('Turn on two-step verification for your own account first');
    }
    await this.prisma.client.$executeRaw`
      UPDATE organizations SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('require2fa', ${require2fa}::boolean)
      WHERE id = ${orgId}`;
    return this.security(orgId);
  }

  /**
   * The whole workspace as one JSON document, for its owner to keep or to
   * take elsewhere: people, cards, leads with their history, pipeline, chips,
   * occasions and ready messages. Reads go through the tenant scope.
   */
  async export(orgId: string) {
    const db = this.prisma.client;
    const [org, members, cards, leads, stages, tags, occasions, templates] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, slug: true, plan: true, branding: true, settings: true, createdAt: true } }),
      db.membership.findMany({ select: { role: true, status: true, createdAt: true, user: { select: { name: true, email: true } } } }),
      db.card.findMany({
        select: {
          id: true, slug: true, templateId: true, theme: true, vcardData: true, isPublished: true, createdAt: true, updatedAt: true,
          owner: { select: { name: true, email: true } },
          sections: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
          actions: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
        },
      }),
      db.lead.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, name: true, email: true, phone: true, company: true, source: true, score: true, value: true, createdAt: true,
          firstContactedAt: true, lastContactedAt: true, cardId: true,
          stage: { select: { name: true } },
          assignee: { select: { name: true, email: true } },
          activities: { orderBy: { createdAt: 'asc' }, select: { type: true, metadata: true, createdAt: true } },
        },
      }),
      db.pipelineStage.findMany({ orderBy: { order: 'asc' }, select: { name: true, order: true, color: true, isWon: true } }),
      db.nfcTag.findMany({ select: { uid: true, status: true, hardwareType: true, cardId: true, activationCount: true, lastScanAt: true, assignedUser: { select: { email: true } } } }),
      db.occasion.findMany({ orderBy: { startsOn: 'asc' }, select: { name: true, startsOn: true, endsOn: true } }),
      db.messageTemplate.findMany({ orderBy: { order: 'asc' }, select: { name: true, channel: true, subject: true, body: true } }),
    ]);
    if (!org) throw new BadRequestException('Organization not found');
    const { settings, ...rest } = org;
    // Bookkeeping the sweeps keep in settings is not the workspace's data.
    const { weeklyReportWeek: _w, ...ownSettings } = (settings ?? {}) as Record<string, unknown>;
    return {
      exportedAt: new Date().toISOString(),
      workspace: { ...rest, settings: ownSettings },
      members: members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role, status: m.status, joinedAt: m.createdAt })),
      cards,
      leads: leads.map(({ stage, assignee, ...l }) => ({ ...l, stage: stage?.name ?? null, assignedTo: assignee?.email ?? null })),
      pipeline: stages,
      chips: tags.map(({ assignedUser, ...t }) => ({ ...t, holder: assignedUser?.email ?? null })),
      occasions,
      messageTemplates: templates,
    };
  }
}
