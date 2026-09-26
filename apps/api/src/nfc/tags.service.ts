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
    try {
      // Check and insert share a transaction so concurrent registrations
      // cannot all pass the same stale count (see LimitsService.guard).
      return await this.limits.guard(tenant.orgId, 'nfcTags', (tx) =>
        tx.nfcTag.create({
          data: {
            orgId: tenant.orgId,
            uid: input.uid,
            hardwareType: input.hardwareType ?? 'CARD',
            batchId: input.batchId,
          },
        }),
      );
    } catch (err) {
      throw this.mapUidConflict(err);
    }
  }

  /** Factory batch registration — bulk insert, skipping UIDs that already exist. */
  async createBatch(tenant: TenantContext, input: CreateTagsBatchInput) {
    const rows = input.uids.map((uid) => ({
      orgId: tenant.orgId,
      uid,
      hardwareType: input.hardwareType ?? 'CARD',
      batchId: input.batchId,
    }));
    const result = await this.limits.guard(
      tenant.orgId,
      'nfcTags',
      (tx) => tx.nfcTag.createMany({ data: rows, skipDuplicates: true }),
      rows.length,
    );
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

  /**
   * Permanently removes a tag, freeing its UID for re-registration.
   *
   * Nothing holds a foreign key to NfcTag — scan events are recorded against
   * the card, not the tag — so the tag's own counters are the only surviving
   * record that it was ever used. A scanned tag therefore carries history a
   * delete would silently destroy, and is refused instead; related data is
   * never removed on the caller's behalf.
   */
  async remove(tenant: TenantContext, id: string) {
    const tag = await this.findOne(tenant, id);
    if (tag.activationCount > 0) {
      throw new ConflictException(
        `Cannot delete this tag: it has ${tag.activationCount} recorded scan(s). ` +
          'Disable it instead — that stops it resolving while keeping its history.',
      );
    }
    await this.db.nfcTag.delete({ where: { id } });
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
