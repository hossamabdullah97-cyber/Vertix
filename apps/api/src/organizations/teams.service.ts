import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreateTeamInput, UpdateTeamInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list() {
    const teams = await this.db.team.findMany({
      select: {
        id: true,
        name: true,
        managerId: true,
        color: true,
        departmentId: true,
        createdAt: true,
        manager: { select: { id: true, name: true, email: true, avatarUrl: true } },
        department: { select: { id: true, name: true } },
        memberships: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = await Promise.all(
      teams.map(async (t) => {
        const memberIds = t.memberships.map((m) => m.user.id);
        
        let viewsCount = 0;
        let leadsCount = 0;
        let totalTasks = 0;
        let completedTasks = 0;

        if (memberIds.length > 0) {
          viewsCount = await this.db.event.count({
            where: { type: 'VIEW', card: { ownerId: { in: memberIds } } },
          });
          leadsCount = await this.db.lead.count({
            where: { card: { ownerId: { in: memberIds } } },
          });
          totalTasks = await this.db.task.count({
            where: { assignedTo: { in: memberIds } },
          });
          completedTasks = await this.db.task.count({
            where: { assignedTo: { in: memberIds }, completed: true },
          });
        }

        // Compute Health Score dynamically
        let healthScore = 'GOOD';
        let healthColor = '🟡';
        let performanceScore = 70;
        
        if (memberIds.length === 0) {
          healthScore = 'CRITICAL';
          healthColor = '🔴';
          performanceScore = 0;
        } else {
          const taskRatio = totalTasks > 0 ? completedTasks / totalTasks : 1;
          performanceScore = Math.min(100, Math.round((taskRatio * 40) + (Math.min(10, leadsCount) * 4) + (Math.min(50, viewsCount) * 0.4)));
          
          if (performanceScore >= 80) {
            healthScore = 'EXCELLENT';
            healthColor = '🟢';
          } else if (performanceScore >= 50) {
            healthScore = 'GOOD';
            healthColor = '🟡';
          } else if (performanceScore >= 25) {
            healthScore = 'NEEDS_ATTENTION';
            healthColor = '🟠';
          } else {
            healthScore = 'CRITICAL';
            healthColor = '🔴';
          }
        }

        return {
          ...t,
          views: viewsCount,
          leads: leadsCount,
          completedTasks,
          totalTasks,
          healthScore,
          healthColor,
          performanceScore,
        };
      })
    );

    return enriched;
  }

  async findOne(id: string) {
    const team = await this.db.team.findFirst({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true, avatarUrl: true } },
        department: { select: { id: true, name: true, color: true } },
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
    if (!team) throw new NotFoundException('Team not found');

    const memberIds = team.memberships.map((m) => m.user.id);
    
    let viewsCount = 0;
    let leadsCount = 0;
    let totalTasks = 0;
    let completedTasks = 0;

    if (memberIds.length > 0) {
      viewsCount = await this.db.event.count({
        where: { type: 'VIEW', card: { ownerId: { in: memberIds } } },
      });
      leadsCount = await this.db.lead.count({
        where: { card: { ownerId: { in: memberIds } } },
      });
      totalTasks = await this.db.task.count({
        where: { assignedTo: { in: memberIds } },
      });
      completedTasks = await this.db.task.count({
        where: { assignedTo: { in: memberIds }, completed: true },
      });
    }

    const taskRatio = totalTasks > 0 ? completedTasks / totalTasks : 1;
    const performanceScore = memberIds.length === 0 ? 0 : Math.min(100, Math.round((taskRatio * 40) + (Math.min(10, leadsCount) * 4) + (Math.min(50, viewsCount) * 0.4)));
    
    let healthScore = 'GOOD';
    if (memberIds.length === 0) {
      healthScore = 'CRITICAL';
    } else if (performanceScore >= 80) {
      healthScore = 'EXCELLENT';
    } else if (performanceScore >= 50) {
      healthScore = 'GOOD';
    } else if (performanceScore >= 25) {
      healthScore = 'NEEDS_ATTENTION';
    } else {
      healthScore = 'CRITICAL';
    }

    return {
      ...team,
      views: viewsCount,
      leads: leadsCount,
      completedTasks,
      totalTasks,
      healthScore,
      performanceScore,
    };
  }

  async create(tenant: TenantContext, input: CreateTeamInput) {
    const team = await this.db.team.create({
      data: {
        orgId: tenant.orgId,
        name: input.name,
        managerId: input.managerId,
        color: input.color ?? '#6366f1',
        departmentId: input.departmentId,
      },
      select: { id: true, name: true, managerId: true, color: true, departmentId: true },
    });
    await this.audit.log(tenant, 'team.created', { targetType: 'team', targetId: team.id, metadata: { name: team.name } });
    await this.notifications.notifyOrgAdmins(tenant.orgId, tenant.userId, {
      type: 'team.created',
      category: 'ORGANIZATION',
      priority: 'LOW',
      title: `Team “${team.name}” created`,
      metadata: { teamId: team.id, name: team.name },
    });
    return team;
  }

  async update(tenant: TenantContext, id: string, input: UpdateTeamInput) {
    const team = await this.db.team.findFirst({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    
    const updated = await this.db.team.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      },
      select: { id: true, name: true, managerId: true, color: true, departmentId: true },
    });
    await this.audit.log(tenant, 'team.updated', { targetType: 'team', targetId: id, metadata: { name: updated.name } });
    return updated;
  }

  async remove(tenant: TenantContext, id: string) {
    const team = await this.db.team.findFirst({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    await this.db.team.softDelete({ id });
    await this.audit.log(tenant, 'team.deleted', { targetType: 'team', targetId: id, metadata: { name: team.name } });
    await this.notifications.notifyOrgAdmins(tenant.orgId, tenant.userId, {
      type: 'team.deleted',
      category: 'ORGANIZATION',
      priority: 'LOW',
      title: `Team “${team.name}” deleted`,
      metadata: { name: team.name },
    });
    return { id, removed: true };
  }
}
