import { Injectable, Logger } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';

interface AuditOpts {
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Immutable, org-scoped audit trail. Writes are best-effort (never block the
 * primary action). orgId is auto-injected by the tenant Prisma extension; the
 * actor is taken from the request's tenant context.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(tenant: TenantContext, action: string, opts: AuditOpts = {}): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          orgId: tenant.orgId,
          actorId: tenant.userId,
          action,
          targetType: opts.targetType,
          targetId: opts.targetId,
          metadata: opts.metadata as never,
        },
      });
    } catch (err) {
      this.logger.warn(`audit log failed (${action}): ${(err as Error).message}`);
    }
  }

  /** Recent audit entries for the active org (newest first). */
  list(limit = 100) {
    return this.prisma.client.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
  }
}
