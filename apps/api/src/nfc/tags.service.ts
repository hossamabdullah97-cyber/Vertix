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

  /**
   * A workspace may only bind hardware the platform actually issued, so the
   * chip has to exist in the platform registry and be free. Without this, any
   * manager could buy a blank chip anywhere and register its UID here.
   *
   * Returns the chip so the caller can mark it claimed in the same transaction.
   */
  private async assertChipIssued(uid: string, orgId: string) {
    const chip = await this.db.nfcChip.findUnique({ where: { uid } });

    if (!chip) {
      throw new NotFoundException(
        'This chip is not registered with the platform. Only chips issued by Vertex Connect can be used.',
      );
    }
    if (chip.status === 'BLOCKED') {
      throw new ConflictException('This chip has been blocked and cannot be used.');
    }
    if (chip.claimedByOrgId && chip.claimedByOrgId !== orgId) {
      throw new ConflictException('This chip already belongs to another workspace.');
    }
    return chip;
  }

  async create(tenant: TenantContext, input: CreateTagInput) {
    await this.assertChipIssued(input.uid, tenant.orgId);

    try {
      // Check and insert share a transaction so concurrent registrations
      // cannot all pass the same stale count (see LimitsService.guard).
      return await this.limits.guard(tenant.orgId, 'nfcTags', async (tx) => {
        const tag = await tx.nfcTag.create({
          data: {
            orgId: tenant.orgId,
            uid: input.uid,
            hardwareType: input.hardwareType ?? 'CARD',
            batchId: input.batchId,
          },
        });
        // Claim inside the same transaction: if the tag insert loses a race on
        // the unique UID, the chip must not be left marked as taken.
        await tx.nfcChip.update({
          where: { uid: input.uid },
          data: { status: 'CLAIMED', claimedByOrgId: tenant.orgId, claimedAt: new Date() },
        });
        return tag;
      });
    } catch (err) {
      throw this.mapUidConflict(err);
    }
  }

  /**
   * Batch registration. Same rule as `create`: every UID must already be in the
   * platform registry and free, so a bulk paste cannot smuggle in chips the
   * platform never issued. Unusable UIDs are reported rather than silently
   * dropped, so the operator can see which ones were rejected and why.
   */
  async createBatch(tenant: TenantContext, input: CreateTagsBatchInput) {
    const chips = await this.db.nfcChip.findMany({
      where: { uid: { in: input.uids } },
    });
    const byUid = new Map(chips.map((c) => [c.uid, c]));

    const usable: string[] = [];
    const rejected: { uid: string; reason: string }[] = [];

    for (const uid of input.uids) {
      const chip = byUid.get(uid);
      if (!chip) rejected.push({ uid, reason: 'NOT_REGISTERED' });
      else if (chip.status === 'BLOCKED') rejected.push({ uid, reason: 'BLOCKED' });
      else if (chip.claimedByOrgId && chip.claimedByOrgId !== tenant.orgId)
        rejected.push({ uid, reason: 'CLAIMED_BY_ANOTHER_WORKSPACE' });
      else usable.push(uid);
    }

    if (usable.length === 0) {
      return { requested: input.uids.length, created: 0, rejected };
    }

    const rows = usable.map((uid) => ({
      orgId: tenant.orgId,
      uid,
      hardwareType: input.hardwareType ?? 'CARD',
      batchId: input.batchId,
    }));

    const result = await this.limits.guard(
      tenant.orgId,
      'nfcTags',
      async (tx) => {
        const created = await tx.nfcTag.createMany({ data: rows, skipDuplicates: true });
        await tx.nfcChip.updateMany({
          where: { uid: { in: usable } },
          data: { status: 'CLAIMED', claimedByOrgId: tenant.orgId, claimedAt: new Date() },
        });
        return created;
      },
      rows.length,
    );
    return { requested: input.uids.length, created: result.count, rejected };
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
    // The workspace has given the hardware back, so the platform registry must
    // stop showing it as taken — otherwise the chip could never be re-issued.
    // Deliberately not done on unassign: unbinding a card leaves the chip with
    // the same workspace. A BLOCKED chip stays blocked.
    await this.db.nfcChip.updateMany({
      where: { uid: tag.uid, status: 'CLAIMED' },
      data: { status: 'AVAILABLE', claimedByOrgId: null, claimedAt: null },
    });
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
