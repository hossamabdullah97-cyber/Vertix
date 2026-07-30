import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list() {
    return this.db.department.findMany({
      select: {
        id: true,
        name: true,
        managerId: true,
        color: true,
        createdAt: true,
        manager: { select: { id: true, name: true, email: true, avatarUrl: true } },
        _count: { select: { teams: true, memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const dept = await this.db.department.findFirst({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true, avatarUrl: true } },
        teams: {
          select: {
            id: true,
            name: true,
            color: true,
            manager: { select: { id: true, name: true } },
            _count: { select: { memberships: true } },
          },
        },
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(tenant: TenantContext, input: CreateDepartmentInput) {
    const managerId = input.managerId ?? tenant.userId;
    const dept = await this.db.department.create({
      data: {
        orgId: tenant.orgId,
        name: input.name,
        managerId,
        color: input.color ?? '#6366f1',
      },
      select: { id: true, name: true, managerId: true, color: true },
    });
    await this.audit.log(tenant, 'department.created', {
      targetType: 'department',
      targetId: dept.id,
      metadata: { name: dept.name },
    });
    return dept;
  }

  async update(tenant: TenantContext, id: string, input: UpdateDepartmentInput) {
    const dept = await this.db.department.findFirst({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    
    const updated = await this.db.department.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
      select: { id: true, name: true, managerId: true, color: true },
    });
    await this.audit.log(tenant, 'department.updated', {
      targetType: 'department',
      targetId: id,
      metadata: { name: updated.name },
    });
    return updated;
  }

  async remove(tenant: TenantContext, id: string) {
    const dept = await this.db.department.findFirst({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');

    // Remove relations safely
    await this.db.team.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });
    await this.db.membership.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });

    await this.db.department.delete({ where: { id } });
    await this.audit.log(tenant, 'department.deleted', {
      targetType: 'department',
      targetId: id,
      metadata: { name: dept.name },
    });
    return { id, removed: true };
  }
}
