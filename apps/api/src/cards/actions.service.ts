import { Injectable } from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import type { CreateActionInput, UpdateActionInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';

/**
 * CardAction has no orgId — isolation happens through the verified parent (Card).
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list(tenant: TenantContext, cardId: string, variantId?: string | null) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.cardAction.findMany({
      where: { cardId, variantId: variantId ?? null },
      orderBy: { order: 'asc' },
    });
  }

  async create(
    tenant: TenantContext,
    cardId: string,
    input: CreateActionInput,
    variantId?: string | null,
  ) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.cardAction.create({
      data: {
        cardId,
        variantId: variantId ?? null,
        type: input.type,
        order: input.order ?? 0,
        isActive: input.isActive ?? true,
        config: input.config as Prisma.InputJsonValue,
      },
    });
  }

  async update(
    tenant: TenantContext,
    cardId: string,
    actionId: string,
    input: UpdateActionInput,
  ) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.cardAction.update({
      where: { id: actionId, cardId },
      data: input as Prisma.CardActionUpdateInput,
    });
  }

  async remove(tenant: TenantContext, cardId: string, actionId: string) {
    await this.cards.ensureEditable(tenant, cardId);
    await this.db.cardAction.softDelete({ id: actionId, cardId });
    return { id: actionId, deleted: true };
  }

  async reorder(tenant: TenantContext, cardId: string, ids: string[]) {
    await this.cards.ensureEditable(tenant, cardId);
    await this.db.$transaction(
      ids.map((id, index) =>
        this.db.cardAction.update({
          where: { id, cardId },
          data: { order: index },
        }),
      ),
    );
    return this.list(tenant, cardId);
  }
}
