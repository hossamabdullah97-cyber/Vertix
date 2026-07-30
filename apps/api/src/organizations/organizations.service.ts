import { Injectable } from '@nestjs/common';
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
  updateCurrent(orgId: string, input: UpdateOrgInput) {
    return this.prisma.client.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.branding !== undefined ? { branding: (input.branding ?? undefined) as never } : {}),
        ...(input.settings !== undefined ? { settings: (input.settings ?? undefined) as never } : {}),
      },
      select: { id: true, name: true, slug: true, plan: true, branding: true, settings: true },
    });
  }
}
