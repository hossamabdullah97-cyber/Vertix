import {
  BadRequestException,
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
/** What `status` may filter by. */
const TAG_STATUSES = ['UNASSIGNED', 'ACTIVE', 'DISABLED'] as const;

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
   * A workspace may only bind hardware the platform actually issued to it, so
   * the chip has to exist in the platform registry, be free, and — when the
   * platform allocated it to a buyer — belong to this workspace.
   *
   * The allocation check is the one that makes a purchase real. Without it
   * every AVAILABLE chip was claimable by anyone who knew its UID, and UIDs
   * within a manufacturing batch tend to run in sequence, so one customer could
   * work out the UIDs of a batch shipped to another and claim them first.
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
    // Deliberately the same wording as an unclaimed foreign chip: a workspace
    // should not be able to probe UIDs to learn what another one was shipped.
    if (chip.allocatedToOrgId && chip.allocatedToOrgId !== orgId) {
      throw new ConflictException('This chip was issued to another workspace.');
    }
    if (chip.claimedByOrgId && chip.claimedByOrgId !== orgId) {
      throw new ConflictException('This chip was issued to another workspace.');
    }
    return chip;
  }

  /**
   * An employee may only put hardware in their own hands, so the holder is
   * forced to themselves rather than taken from the request. Anyone from
   * manager up may hand a chip to a named member.
   */
  private holderFor(tenant: TenantContext, requested?: string | null) {
    if (tenant.role === 'EMPLOYEE') return tenant.userId;
    return requested ?? null;
  }

  /**
   * Employees see only their own hardware. Besides being the right scope for
   * them, it stops a tag list being a directory of the workspace's UIDs.
   */
  private holderFilter(tenant: TenantContext): { assignedUserId?: string } {
    return tenant.role === 'EMPLOYEE' ? { assignedUserId: tenant.userId } : {};
  }

  async create(tenant: TenantContext, input: CreateTagInput) {
    await this.assertChipIssued(input.uid, tenant.orgId);
    const assignedUserId = this.holderFor(tenant, input.assignedUserId);
    if (assignedUserId) await this.assertMember(tenant, assignedUserId);

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
            assignedUserId,
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
    const assignedUserId = this.holderFor(tenant, input.assignedUserId);
    if (assignedUserId) await this.assertMember(tenant, assignedUserId);

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
      else if (chip.allocatedToOrgId && chip.allocatedToOrgId !== tenant.orgId)
        rejected.push({ uid, reason: 'ISSUED_TO_ANOTHER_WORKSPACE' });
      else if (chip.claimedByOrgId && chip.claimedByOrgId !== tenant.orgId)
        rejected.push({ uid, reason: 'ISSUED_TO_ANOTHER_WORKSPACE' });
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
      assignedUserId,
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

  list(
    tenant: TenantContext,
    filters: { batchId?: string; status?: string; assignedUserId?: string },
  ) {
    const where: Prisma.NfcTagWhereInput = { ...this.holderFilter(tenant) };
    if (filters.batchId) where.batchId = filters.batchId;
    if (filters.status) {
      if (!TAG_STATUSES.includes(filters.status as never)) throw new BadRequestException('Unknown chip status');
      where.status = filters.status as never;
    }
    // An explicit filter cannot widen an employee's own scope: theirs is spread
    // first only when they are not an employee.
    if (filters.assignedUserId && tenant.role !== 'EMPLOYEE') {
      where.assignedUserId = filters.assignedUserId;
    }
    return this.db.nfcTag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findOne(tenant: TenantContext, id: string) {
    const tag = await this.db.nfcTag.findFirst({
      where: { id, ...this.holderFilter(tenant) },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  /** The holder has to be a member of this workspace, not any user id. */
  private async assertMember(tenant: TenantContext, userId: string) {
    const membership = await this.db.membership.findFirst({
      where: { userId, orgId: tenant.orgId },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('That member is not part of this workspace.');
    }
  }

  /** Hands a chip to a member (manager+), or takes the holder off it. */
  async setHolder(tenant: TenantContext, id: string, userId: string | null) {
    await this.findOne(tenant, id);
    if (userId) await this.assertMember(tenant, userId);
    return this.db.nfcTag.update({
      where: { id },
      data: { assignedUserId: userId },
    });
  }

  async update(tenant: TenantContext, id: string, input: UpdateTagInput) {
    await this.findOne(tenant, id);
    return this.db.nfcTag.update({
      where: { id },
      data: input as Prisma.NfcTagUpdateInput,
    });
  }

  /**
   * Points a tag at a card (the card must belong to the same organization).
   *
   * The holder and the card have to agree: pointing someone's chip at another
   * member's card would make every scan of it count towards the wrong person,
   * which is exactly what the per-member reporting reads. An employee is also
   * held to their own cards — the tenant scope alone would let them pick any
   * card in the workspace.
   */
  async assign(tenant: TenantContext, id: string, cardId: string) {
    const tag = await this.findOne(tenant, id);
    const card = await this.db.card.findFirst({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Card not found');

    if (tenant.role === 'EMPLOYEE' && card.ownerId !== tenant.userId) {
      throw new ConflictException('You can only link your own cards to a chip.');
    }
    if (tag.assignedUserId && card.ownerId !== tag.assignedUserId) {
      throw new ConflictException(
        "This chip belongs to a member, so it can only be linked to that member's card.",
      );
    }

    return this.db.nfcTag.update({
      where: { id },
      // A chip handed out without a stated holder takes the card owner as its
      // holder, so reporting has someone to credit either way.
      data: {
        cardId,
        status: 'ACTIVE',
        ...(tag.assignedUserId ? {} : { assignedUserId: card.ownerId }),
      },
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
