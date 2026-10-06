import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CustomRoleInput, CustomRoleView } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

type Row = { id: string; name: string; description: string | null; base: string; capabilities: string[]; createdAt: Date; _count: { memberships: number } };
const view = (r: Row): CustomRoleView => ({
  id: r.id,
  name: r.name,
  description: r.description,
  base: r.base as CustomRoleView['base'],
  capabilities: r.capabilities,
  members: r._count.memberships,
  createdAt: r.createdAt.toISOString(),
});

/**
 * The roles a company workspace makes for itself, and who holds them. Only
 * a built-in owner or admin manages them (never someone through a custom
 * role), nobody gives one to themselves, and an owner keeps full access.
 */
@Injectable()
export class CustomRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private async assertTeamWorkspace(tenant: TenantContext) {
    const org = await this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { kind: true } });
    if (org?.kind !== 'TEAM') throw new BadRequestException('Custom roles are for company workspaces');
  }

  async list(): Promise<CustomRoleView[]> {
    const rows = await this.db.customRole.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { memberships: { where: { status: { in: ['ACTIVE', 'INVITED'] } } } } } } });
    return rows.map(view);
  }

  async create(tenant: TenantContext, input: CustomRoleInput): Promise<CustomRoleView> {
    await this.assertTeamWorkspace(tenant);
    try {
      const row = await this.db.customRole.create({
        data: { orgId: tenant.orgId, name: input.name, description: input.description || null, base: input.base, capabilities: [...new Set(input.capabilities)] },
        include: { _count: { select: { memberships: true } } },
      });
      await this.audit.log(tenant, 'role.created', { targetType: 'customRole', targetId: row.id, metadata: { name: row.name, base: row.base, capabilities: row.capabilities } });
      return view(row);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A role with this name already exists');
      throw e;
    }
  }

  async update(tenant: TenantContext, id: string, input: CustomRoleInput): Promise<CustomRoleView> {
    const found = await this.db.customRole.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Role not found');
    try {
      const row = await this.db.$transaction(async (tx) => {
        const r = await tx.customRole.update({
          where: { id },
          data: { name: input.name, description: input.description || null, base: input.base, capabilities: [...new Set(input.capabilities)] },
          include: { _count: { select: { memberships: true } } },
        });
        // Its holders move to the new base role with it.
        await tx.membership.updateMany({ where: { customRoleId: id }, data: { role: input.base } });
        return r;
      });
      await this.audit.log(tenant, 'role.updated', { targetType: 'customRole', targetId: id, metadata: { name: row.name, base: row.base, capabilities: row.capabilities } });
      return view(row);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A role with this name already exists');
      throw e;
    }
  }

  /** Its holders keep their base role. */
  async remove(tenant: TenantContext, id: string) {
    const found = await this.db.customRole.findFirst({ where: { id }, select: { id: true, name: true } });
    if (!found) throw new NotFoundException('Role not found');
    await this.db.customRole.delete({ where: { id } });
    await this.audit.log(tenant, 'role.deleted', { targetType: 'customRole', targetId: id, metadata: { name: found.name } });
    return { ok: true };
  }

  /** Gives a member a custom role (their role becomes its base), or takes it away (they keep the base). */
  async assign(tenant: TenantContext, membershipId: string, customRoleId: string | null) {
    const member = await this.db.membership.findFirst({ where: { id: membershipId }, select: { id: true, userId: true, role: true } });
    if (!member) throw new NotFoundException('Member not found');
    if (member.userId === tenant.userId) throw new ForbiddenException('You can’t change your own role');
    if (member.role === 'OWNER') throw new BadRequestException('Owners keep full access');
    let data: { customRoleId: string | null; role?: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' } = { customRoleId: null };
    if (customRoleId) {
      const role = await this.db.customRole.findFirst({ where: { id: customRoleId }, select: { id: true, base: true } });
      if (!role) throw new NotFoundException('Role not found');
      data = { customRoleId: role.id, role: role.base as 'ADMIN' | 'MANAGER' | 'EMPLOYEE' };
    }
    const updated = await this.db.membership.update({ where: { id: membershipId }, data, select: { id: true, role: true, customRoleId: true } });
    await this.audit.log(tenant, 'member.role_changed', { targetType: 'membership', targetId: membershipId, metadata: { customRoleId, role: updated.role } });
    return updated;
  }
}
