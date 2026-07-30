import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import type {
  CreateTagInput,
  CreateTagsBatchInput,
  UpdateTagInput,
} from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LimitsService } from '../billing/limits.service';

/**
 * NFC tag inventory management (org-scoped, manager+).
 * orgId is auto-injected on every query via the tenant context.
 */
@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async create(tenant: TenantContext, input: CreateTagInput) {
    await this.limits.assertWithin(tenant.orgId, 'nfcTags');
    try {
      return await this.db.nfcTag.create({
        data: {
          orgId: tenant.orgId,
          uid: input.uid,
          hardwareType: input.hardwareType ?? 'CARD',
          batchId: input.batchId,
        },
      });
    } catch (err) {
      throw this.mapUidConflict(err);
    }
  }

  /** Factory batch registration — bulk insert, skipping UIDs that already exist. */
  async createBatch(tenant: TenantContext, input: CreateTagsBatchInput) {
    await this.limits.assertWithin(tenant.orgId, 'nfcTags', input.uids.length);
    const rows = input.uids.map((uid) => ({
      orgId: tenant.orgId,
      uid,
      hardwareType: input.hardwareType ?? 'CARD',
      batchId: input.batchId,
    }));
    const result = await this.db.nfcTag.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { requested: rows.length, created: result.count };
  }

  list(_tenant: TenantContext, filters: { batchId?: string; status?: string }) {
    const where: Prisma.NfcTagWhereInput = {};
    if (filters.batchId) where.batchId = filters.batchId;
    if (filters.status) where.status = filters.status as never;
    return this.db.nfcTag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(_tenant: TenantContext, id: string) {
    const tag = await this.db.nfcTag.findFirst({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  async update(tenant: TenantContext, id: string, input: UpdateTagInput) {
    await this.findOne(tenant, id);
    return this.db.nfcTag.update({
      where: { id },
      data: input as Prisma.NfcTagUpdateInput,
    });
  }

  /** Assigns a tag to a card (the card must belong to the same organization). */
  async assign(tenant: TenantContext, id: string, cardId: string) {
    await this.findOne(tenant, id);
    const card = await this.db.card.findFirst({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Card not found');
    return this.db.nfcTag.update({
      where: { id },
      data: { cardId, status: 'ACTIVE' },
    });
  }

  async unassign(tenant: TenantContext, id: string) {
    await this.findOne(tenant, id);
    return this.db.nfcTag.update({
      where: { id },
      data: { cardId: null, status: 'UNASSIGNED' },
    });
  }

  async remove(tenant: TenantContext, id: string) {
    await this.findOne(tenant, id);
    await this.db.nfcTag.softDelete({ id });
    return { id, deleted: true };
  }

  private mapUidConflict(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException('A tag with this UID already exists');
    }
    return err;
  }
}
