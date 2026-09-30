import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreateTaskInput, UpdateTaskInput } from '@vertex/shared';
import { leadsVisibleTo, tasksVisibleTo } from '../leads/lead-visibility';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /** The org's tasks this person may see (orgId + soft-delete handled by the tenant extension). */
  list(viewer: TenantContext, leadId?: string) {
    return this.db.task.findMany({
      where: { ...(leadId ? { leadId } : {}), ...tasksVisibleTo(viewer) },
      orderBy: [{ completed: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        notes: true,
        priority: true,
        dueDate: true,
        completed: true,
        completedAt: true,
        leadId: true,
        createdAt: true,
        lead: { select: { id: true, name: true } },
      },
    });
  }

  async create(viewer: TenantContext, input: CreateTaskInput) {
    // A caller-supplied leadId must belong to the active org. The tenant
    // extension scopes this lookup, so a lead from another organization simply
    // is not found — without the check the FK would be stored and the lead's
    // name would surface through the `lead` relation on list().
    if (input.leadId) await this.assertLeadVisible(viewer, input.leadId);
    return this.db.task.create({
      data: {
        orgId: viewer.orgId,
        // Whoever adds a task has it, so a member keeps seeing the tasks they add.
        assignedTo: viewer.userId,
        title: input.title,
        notes: input.notes,
        priority: input.priority ?? 'MEDIUM',
        leadId: input.leadId || undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      select: { id: true, title: true, notes: true, priority: true, dueDate: true, completed: true, completedAt: true, leadId: true, createdAt: true, lead: { select: { id: true, name: true } } },
    });
  }

  async update(viewer: TenantContext, id: string, input: UpdateTaskInput) {
    const task = await this.db.task.findFirst({ where: { id, ...tasksVisibleTo(viewer) }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
    return this.db.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.completed !== undefined ? { completed: input.completed, completedAt: input.completed ? new Date() : null } : {}),
      },
      select: { id: true, title: true, notes: true, priority: true, dueDate: true, completed: true, completedAt: true, leadId: true, createdAt: true, lead: { select: { id: true, name: true } } },
    });
  }

  async remove(viewer: TenantContext, id: string) {
    const task = await this.db.task.findFirst({ where: { id, ...tasksVisibleTo(viewer) }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
    await this.db.task.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /** The lead must exist inside the active tenant (extension-scoped lookup) and be one this person may see. */
  private async assertLeadVisible(viewer: TenantContext, leadId: string) {
    const lead = await this.db.lead.findFirst({ where: { id: leadId, ...leadsVisibleTo(viewer) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');
  }
}
