import { Injectable } from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import type { CreateSectionInput, UpdateSectionInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';

/**
 * CardSection has no orgId — isolation happens through the verified parent (Card).
 * Every operation calls ensureEditable on the card first, then constrains the
 * query by cardId.
 */
@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list(tenant: TenantContext, cardId: string, variantId?: string | null) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.cardSection.findMany({
      // undefined variantId → the card's default profile (variantId null).
      where: { cardId, variantId: variantId ?? null },
      orderBy: { order: 'asc' },
    });
  }

  async create(
    tenant: TenantContext,
    cardId: string,
    input: CreateSectionInput,
    variantId?: string | null,
  ) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.cardSection.create({
      data: {
        cardId,
        variantId: variantId ?? null,
        type: input.type,
        order: input.order ?? 0,
        isVisible: input.isVisible ?? true,
        content: input.content as Prisma.InputJsonValue,
      },
    });
  }

  async update(
    tenant: TenantContext,
    cardId: string,
    sectionId: string,
    input: UpdateSectionInput,
  ) {
    await this.cards.ensureEditable(tenant, cardId);
    // where: { id, cardId } ensures the section belongs to this card.
    return this.db.cardSection.update({
      where: { id: sectionId, cardId },
      data: input as Prisma.CardSectionUpdateInput,
    });
  }

  async remove(tenant: TenantContext, cardId: string, sectionId: string) {
    await this.cards.ensureEditable(tenant, cardId);
    await this.db.cardSection.softDelete({ id: sectionId, cardId });
    return { id: sectionId, deleted: true };
  }

  async reorder(tenant: TenantContext, cardId: string, ids: string[]) {
    await this.cards.ensureEditable(tenant, cardId);
    await this.db.$transaction(
      ids.map((id, index) =>
        this.db.cardSection.update({
          where: { id, cardId },
          data: { order: index },
        }),
      ),
    );
    return this.list(tenant, cardId);
  }
}
