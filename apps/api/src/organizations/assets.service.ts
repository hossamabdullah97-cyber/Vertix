import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreateAssetInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /** Org media library (orgId + soft-delete handled by the tenant extension). */
  list() {
    return this.db.asset.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        url: true,
        mimeType: true,
        size: true,
        createdAt: true,
        uploader: { select: { name: true, email: true } },
      },
    });
  }

  create(tenant: TenantContext, input: CreateAssetInput) {
    return this.db.asset.create({
      data: {
        orgId: tenant.orgId,
        uploadedBy: tenant.userId,
        name: input.name,
        url: input.url,
        mimeType: input.mimeType,
        size: input.size ?? 0,
      },
      select: { id: true, name: true, url: true, mimeType: true, size: true, createdAt: true, uploader: { select: { name: true, email: true } } },
    });
  }

  async remove(id: string) {
    const asset = await this.db.asset.findFirst({ where: { id }, select: { id: true } });
    if (!asset) throw new NotFoundException('Asset not found');
    await this.db.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }
}
