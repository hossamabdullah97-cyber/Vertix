import { BadRequestException, Injectable } from '@nestjs/common';
import type { UpdateOrgInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.client.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
            branding: true,
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
      select: { id: true, name: true, slug: true, plan: true, branding: true, settings: true },
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
      select: { id: true, name: true, slug: true, plan: true, branding: true, settings: true },
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
}
