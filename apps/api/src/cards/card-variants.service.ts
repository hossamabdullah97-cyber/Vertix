import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';

export interface VariantPatch {
  name?: string;
  order?: number;
  templateId?: string;
  theme?: unknown;
  vcardData?: unknown;
  accessKey?: string | null;
  passcode?: string | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  manualActive?: boolean;
}

@Injectable()
export class CardVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** All variants of a card, each with its own sections + actions. */
  async list(tenant: TenantContext, cardId: string) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.cardVariant.findMany({
      where: { cardId, deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        sections: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
        actions: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
      },
    });
  }

  /**
   * Create a variant. It starts as a copy of the card's current base profile
   * (template + theme + vcard) so the owner tweaks a real starting point, and
   * optionally clones the base sections/actions.
   */
  async create(
    tenant: TenantContext,
    cardId: string,
    input: { name: string; cloneDefault?: boolean },
  ) {
    const card = await this.cards.ensureEditable(tenant, cardId);

    const count = await this.db.cardVariant.count({ where: { cardId, deletedAt: null } });

    const variant = await this.db.cardVariant.create({
      data: {
        cardId,
        name: input.name.trim() || `Profile ${count + 1}`,
        order: count,
        templateId: card.templateId,
        theme: (card.theme ?? undefined) as Prisma.InputJsonValue,
        vcardData: (card.vcardData ?? undefined) as Prisma.InputJsonValue,
      },
    });

    if (input.cloneDefault) {
      const [sections, actions] = await Promise.all([
        this.db.cardSection.findMany({ where: { cardId, variantId: null, deletedAt: null } }),
        this.db.cardAction.findMany({ where: { cardId, variantId: null, deletedAt: null } }),
      ]);
      if (sections.length) {
        await this.db.cardSection.createMany({
          data: sections.map((s) => ({
            cardId,
            variantId: variant.id,
            type: s.type,
            order: s.order,
            isVisible: s.isVisible,
            content: s.content as Prisma.InputJsonValue,
          })),
        });
      }
      if (actions.length) {
        await this.db.cardAction.createMany({
          data: actions.map((a) => ({
            cardId,
            variantId: variant.id,
            type: a.type,
            order: a.order,
            isActive: a.isActive,
            config: a.config as Prisma.InputJsonValue,
          })),
        });
      }
    }

    return variant;
  }

  async update(tenant: TenantContext, variantId: string, patch: VariantPatch) {
    const variant = await this.getEditableVariant(tenant, variantId);

    // Access keys must be unique per card (used as the ?p= link token).
    const accessKey =
      patch.accessKey === undefined
        ? undefined
        : patch.accessKey?.trim()
          ? patch.accessKey.trim()
          : null;
    if (accessKey) {
      const clash = await this.db.cardVariant.findFirst({
        where: { cardId: variant.cardId, accessKey, id: { not: variantId }, deletedAt: null },
      });
      if (clash) throw new ConflictException('This access key is already used on this card');
    }

    try {
      return await this.db.cardVariant.update({
        where: { id: variantId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.order !== undefined ? { order: patch.order } : {}),
          ...(patch.templateId !== undefined ? { templateId: patch.templateId } : {}),
          ...(patch.theme !== undefined ? { theme: (patch.theme ?? undefined) as Prisma.InputJsonValue } : {}),
          ...(patch.vcardData !== undefined ? { vcardData: (patch.vcardData ?? undefined) as Prisma.InputJsonValue } : {}),
          ...(accessKey !== undefined ? { accessKey } : {}),
          ...(patch.passcode !== undefined ? { passcode: patch.passcode?.trim() || null } : {}),
          ...(patch.scheduleStart !== undefined ? { scheduleStart: patch.scheduleStart ? new Date(patch.scheduleStart) : null } : {}),
          ...(patch.scheduleEnd !== undefined ? { scheduleEnd: patch.scheduleEnd ? new Date(patch.scheduleEnd) : null } : {}),
          ...(patch.manualActive !== undefined ? { manualActive: patch.manualActive } : {}),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This access key is already used on this card');
      }
      throw err;
    }
  }

  async remove(tenant: TenantContext, variantId: string) {
    await this.getEditableVariant(tenant, variantId);
    await this.db.cardVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date() },
    });
    return { id: variantId, deleted: true };
  }

  /**
   * Detect resolution conflicts among *public* variants (no access key). The
   * resolver picks the first active variant by order, so overlapping activation
   * conditions silently shadow a lower-priority profile — surface that so the
   * owner knows which profile actually wins.
   */
  async getConflicts(tenant: TenantContext, cardId: string) {
    await this.cards.ensureEditable(tenant, cardId);
    const variants = await this.db.cardVariant.findMany({
      where: { cardId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    const pub = variants.filter((v) => !v.accessKey);
    const conflicts: { type: string; variantIds: string[]; message: string }[] = [];

    // More than one profile activated at once — only the first by order shows.
    const manual = pub.filter((v) => v.manualActive);
    if (manual.length > 1) {
      conflicts.push({
        type: 'multiple-active',
        variantIds: manual.map((v) => v.id),
        message: `${manual.length} profiles are activated at once — only “${manual[0].name}” will show.`,
      });
    }

    // Overlapping schedule windows between public profiles.
    const overlaps = (a: (typeof pub)[number], b: (typeof pub)[number]) => {
      if (!(a.scheduleStart || a.scheduleEnd) || !(b.scheduleStart || b.scheduleEnd)) return false;
      const as = a.scheduleStart?.getTime() ?? -Infinity;
      const ae = a.scheduleEnd?.getTime() ?? Infinity;
      const bs = b.scheduleStart?.getTime() ?? -Infinity;
      const be = b.scheduleEnd?.getTime() ?? Infinity;
      return as <= be && bs <= ae;
    };
    for (let i = 0; i < pub.length; i++) {
      for (let j = i + 1; j < pub.length; j++) {
        if (overlaps(pub[i], pub[j])) {
          conflicts.push({
            type: 'schedule-overlap',
            variantIds: [pub[i].id, pub[j].id],
            message: `“${pub[i].name}” and “${pub[j].name}” have overlapping schedules — “${pub[i].name}” wins.`,
          });
        }
      }
    }
    return conflicts;
  }

  private async getEditableVariant(tenant: TenantContext, variantId: string) {
    const variant = await this.db.cardVariant.findFirst({ where: { id: variantId, deletedAt: null } });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.cards.ensureEditable(tenant, variant.cardId);
    return variant;
  }
}

