import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_ORG, runWithTenant, type TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { LimitsService } from '../billing/limits.service';
import { AuditService } from '../organizations/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export const MOVE_OUT_ADMINS_ONLY = 'Only an owner or admin can move a card out of this workspace.';
export const OWNER_NOT_IN_TARGET = "The card's owner is not a member of that workspace.";
export const NOT_A_TARGET = 'You can only move a card to another workspace you are a member of.';

type Stage = { id: string; order: number; isWon: boolean };

/**
 * Where a lead's stage lands in another workspace's pipeline: won stays won;
 * otherwise the stage at the same place, or the last one before it, or the first.
 */
export function mapStage(from: Stage | undefined, to: Stage[]): string | null {
  if (!to.length) return null;
  const sorted = [...to].sort((a, b) => a.order - b.order);
  if (!from) return sorted[0]!.id;
  if (from.isWon) return (sorted.find((s) => s.isWon) ?? sorted[sorted.length - 1]!).id;
  const open = sorted.filter((s) => !s.isWon);
  const same = open.find((s) => s.order === from.order);
  if (same) return same.id;
  const before = open.filter((s) => s.order < from.order).pop();
  return (before ?? open[0] ?? sorted[0]!).id;
}

/**
 * Moving a card to another of its owner's workspaces, with the leads it
 * brought in and its history. Into a company from someone's own workspace
 * is theirs to do; out of a company's, only its owners and admins may, since
 * the card's leads are the company's.
 *
 * The card keeps its address, so printed codes still open it. NFC chips are
 * the old workspace's hardware: they stay there, unlinked.
 */
@Injectable()
export class CardMoveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private across<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return runWithTenant({ orgId: ADMIN_ORG, userId, role: 'OWNER' }, fn);
  }

  /** The workspaces this card may move to, with what would go with it. */
  async targets(tenant: TenantContext, cardId: string) {
    const { card, source } = await this.load(tenant, cardId);
    if (!this.mayMoveOut(tenant, source.kind)) return { allowed: false, targets: [], leads: 0, chips: 0 };
    return this.across(tenant.userId, async () => {
      const [mine, ownerIn, leads, chips] = await Promise.all([
        this.db.membership.findMany({
          where: { userId: tenant.userId, status: 'ACTIVE', orgId: { not: source.id }, org: { deletedAt: null, isActive: true } },
          select: { org: { select: { id: true, name: true, slug: true, kind: true } } },
        }),
        this.db.membership.findMany({ where: { userId: card.ownerId, status: 'ACTIVE' }, select: { orgId: true } }),
        this.db.lead.count({ where: { cardId, orgId: source.id } }),
        this.db.nfcTag.count({ where: { cardId } }),
      ]);
      const owners = new Set(ownerIn.map((m) => m.orgId));
      const targets = mine
        .map((m) => m.org)
        // A person's own workspace takes only what they bring from a company as its owner.
        .filter((o) => !(source.kind === 'PERSONAL' && o.kind === 'PERSONAL'))
        .map((o) => ({ ...o, ownerIsMember: owners.has(o.id) }));
      return { allowed: true, targets, leads, chips };
    });
  }

  async move(tenant: TenantContext, cardId: string, targetOrgId: string) {
    const { card, source } = await this.load(tenant, cardId);
    if (!this.mayMoveOut(tenant, source.kind)) throw new ForbiddenException(MOVE_OUT_ADMINS_ONLY);
    if (targetOrgId === source.id) throw new BadRequestException(NOT_A_TARGET);

    const target = await this.across(tenant.userId, async () => {
      const mine = await this.db.membership.findFirst({
        where: { userId: tenant.userId, orgId: targetOrgId, status: 'ACTIVE', org: { deletedAt: null, isActive: true } },
        select: { org: { select: { id: true, name: true, kind: true } } },
      });
      if (!mine || (source.kind === 'PERSONAL' && mine.org.kind === 'PERSONAL')) throw new BadRequestException(NOT_A_TARGET);
      const owner = await this.db.membership.findFirst({ where: { userId: card.ownerId, orgId: targetOrgId, status: 'ACTIVE' }, select: { id: true } });
      if (!owner) throw new BadRequestException(OWNER_NOT_IN_TARGET);
      return mine.org;
    });

    // The card counts against the plan of the workspace it moves into.
    await runWithTenant({ orgId: target.id, userId: tenant.userId, role: 'OWNER' }, () => this.limits.assertWithin(target.id, 'cards', 1));

    const moved = await this.across(tenant.userId, async () =>
      await this.db.$transaction(async (tx) => {
        const [fromStages, toStages, targetMembers, leads] = await Promise.all([
          tx.pipelineStage.findMany({ where: { orgId: source.id }, select: { id: true, order: true, isWon: true } }),
          tx.pipelineStage.findMany({ where: { orgId: target.id }, select: { id: true, order: true, isWon: true } }),
          tx.membership.findMany({ where: { orgId: target.id, status: 'ACTIVE' }, select: { userId: true } }),
          tx.lead.findMany({ where: { cardId, orgId: source.id }, select: { id: true, stageId: true, assignedTo: true } }),
        ]);
        const inTarget = new Set(targetMembers.map((m) => m.userId));
        const stageById = new Map(fromStages.map((s) => [s.id, s]));
        const leadIds = leads.map((l) => l.id);

        for (const lead of leads) {
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              orgId: target.id,
              stageId: mapStage(lead.stageId ? stageById.get(lead.stageId) : undefined, toStages),
              // The chip it came through stays behind.
              tagId: null,
              // Someone not in the new workspace cannot work it there.
              assignedTo: lead.assignedTo && inTarget.has(lead.assignedTo) ? lead.assignedTo : card.ownerId,
            },
          });
        }
        if (leadIds.length) {
          await tx.task.updateMany({ where: { leadId: { in: leadIds }, orgId: source.id }, data: { orgId: target.id } });
          await tx.task.updateMany({ where: { leadId: { in: leadIds }, assignedTo: { notIn: [...inTarget] } }, data: { assignedTo: card.ownerId } });
          // Sent to the old workspace's CRM; the new one has its own.
          await tx.crmSyncRecord.deleteMany({ where: { orgId: source.id, entityType: 'lead', entityId: { in: leadIds } } });
        }
        // Its views and taps go with it; which chip they came through does not.
        await tx.event.updateMany({ where: { cardId, orgId: source.id }, data: { orgId: target.id, tagId: null } });
        const chips = await tx.nfcTag.updateMany({ where: { cardId }, data: { cardId: null } });
        await tx.cardPresence.deleteMany({ where: { cardId } });
        await tx.card.update({ where: { id: cardId }, data: { orgId: target.id } });
        return { leads: leadIds.length, chips: chips.count };
      }),
    );

    const name = cardName(card);
    await runWithTenant(tenant, () =>
      this.audit.log(tenant, 'card.moved_out', { targetType: 'card', targetId: cardId, metadata: { to: target.id, toName: target.name, leads: moved.leads, chipsUnlinked: moved.chips } }),
    );
    const inTenant: TenantContext = { orgId: target.id, userId: tenant.userId, role: 'OWNER' };
    await runWithTenant(inTenant, async () => {
      await this.audit.log(inTenant, 'card.moved_in', { targetType: 'card', targetId: cardId, metadata: { from: source.id, fromName: source.name, leads: moved.leads } });
      await this.notifications.notifyOrgAdmins(target.id, tenant.userId, {
        type: 'card.moved_in',
        category: 'ORGANIZATION',
        priority: 'LOW',
        title: 'A card was moved into the workspace',
        body: name,
        metadata: { cardId, from: source.name, leads: moved.leads },
      });
    });
    return { cardId, orgId: target.id, ...moved };
  }

  private async load(tenant: TenantContext, cardId: string) {
    // The tenant scope keeps this to the workspace the request is in.
    const card = await this.db.card.findFirst({ where: { id: cardId }, select: { id: true, ownerId: true, vcardData: true, slug: true } });
    if (!card) throw new NotFoundException('Card not found');
    const source = await this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { id: true, name: true, kind: true } });
    if (!source) throw new NotFoundException('Card not found');
    // A member moves only their own card, even within what their role allows.
    if (card.ownerId !== tenant.userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') throw new ForbiddenException(MOVE_OUT_ADMINS_ONLY);
    return { card, source };
  }

  /** Out of a company's workspace, only its owners and admins; out of one's own, its owner. */
  private mayMoveOut(tenant: TenantContext, kind: 'PERSONAL' | 'TEAM') {
    return kind === 'PERSONAL' ? tenant.role === 'OWNER' : tenant.role === 'OWNER' || tenant.role === 'ADMIN';
  }
}

function cardName(card: { vcardData: unknown; slug: string }) {
  const v = (card.vcardData ?? {}) as Record<string, unknown>;
  return typeof v.fullName === 'string' && v.fullName.trim() ? v.fullName.trim() : card.slug;
}
