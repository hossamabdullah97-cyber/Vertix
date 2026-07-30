import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreateApprovalInput, ResolveApprovalInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list() {
    return this.db.approvalRequest.findMany({
      include: {
        requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
        resolver: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenant: TenantContext, input: CreateApprovalInput) {
    const request = await this.db.approvalRequest.create({
      data: {
        orgId: tenant.orgId,
        requesterId: tenant.userId,
        type: input.type,
        status: 'PENDING',
        title: input.title,
        description: input.description,
        metadata: input.metadata as any,
      },
      include: {
        requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    await this.audit.log(tenant, 'approval.requested', {
      targetType: 'approval',
      targetId: request.id,
      metadata: { type: input.type, title: input.title },
    });

    return request;
  }

  async resolve(tenant: TenantContext, id: string, input: ResolveApprovalInput) {
    const request = await this.db.approvalRequest.findFirst({
      where: { id },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Approval request has already been resolved');
    }

    const resolved = await this.db.approvalRequest.update({
      where: { id },
      data: {
        status: input.status,
        comment: input.comment,
        resolverId: tenant.userId,
        resolvedAt: new Date(),
      },
      include: {
        requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
        resolver: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    // Execute corresponding action upon Approval
    if (input.status === 'APPROVED') {
      const meta = (request.metadata as Record<string, any>) || {};
      if (request.type === 'CARD_PUBLISHING' && meta.cardId) {
        await this.db.card.update({
          where: { id: meta.cardId },
          data: { isPublished: true },
        });
      } else if (request.type === 'ROLE_REQUEST' && meta.membershipId && meta.role) {
        await this.db.membership.update({
          where: { id: meta.membershipId },
          data: { role: meta.role },
        });
      }
    }

    // Send notification to the requester
    await this.notifications.notify({
      userId: request.requesterId,
      orgId: tenant.orgId,
      actorId: tenant.userId,
      type: `approval.${input.status.toLowerCase()}`,
      category: 'SYSTEM',
      priority: input.status === 'APPROVED' ? 'HIGH' : 'MEDIUM',
      title: `Approval Request ${input.status}: ${request.title}`,
      body: input.comment || `Your request of type ${request.type} was ${input.status.toLowerCase()}.`,
      metadata: { approvalId: id, status: input.status },
    });

    await this.audit.log(tenant, `approval.${input.status.toLowerCase()}`, {
      targetType: 'approval',
      targetId: id,
      metadata: { type: request.type, status: input.status, comment: input.comment },
    });

    return resolved;
  }
}
