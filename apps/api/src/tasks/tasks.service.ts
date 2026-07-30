import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTaskInput, UpdateTaskInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /** Org tasks (orgId + soft-delete handled by the tenant extension). */
  list(leadId?: string) {
    return this.db.task.findMany({
      where: leadId ? { leadId } : {},
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

  create(orgId: string, input: CreateTaskInput) {
    return this.db.task.create({
      data: {
        orgId,
        title: input.title,
        notes: input.notes,
        priority: input.priority ?? 'MEDIUM',
        leadId: input.leadId || undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      select: { id: true, title: true, notes: true, priority: true, dueDate: true, completed: true, completedAt: true, leadId: true, createdAt: true, lead: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, input: UpdateTaskInput) {
    const task = await this.db.task.findFirst({ where: { id }, select: { id: true } });
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

  async remove(id: string) {
    const task = await this.db.task.findFirst({ where: { id }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
    await this.db.task.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }
}
