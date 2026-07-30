import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreatePaymentLinkInput, UpdatePaymentLinkInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';

/**
 * External payment links (InstaPay, e-wallets). Link-sharing only — no payment
 * processing, no financial data. Like CardAction, PaymentLink has no orgId;
 * isolation happens through the verified parent Card, and variantId scopes a
 * link to a Smart Identity.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list(tenant: TenantContext, cardId: string, variantId?: string | null) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.paymentLink.findMany({
      where: { cardId, variantId: variantId ?? null },
      orderBy: { order: 'asc' },
    });
  }

  async create(
    tenant: TenantContext,
    cardId: string,
    input: CreatePaymentLinkInput,
    variantId?: string | null,
  ) {
    await this.cards.ensureEditable(tenant, cardId);
    // New links append to the end so ordering is deterministic.
    const count = await this.db.paymentLink.count({
      where: { cardId, variantId: variantId ?? null, deletedAt: null },
    });
    return this.db.paymentLink.create({
      data: {
        cardId,
        variantId: variantId ?? null,
        platform: input.platform,
        displayName: input.displayName,
        url: input.url,
        description: input.description,
        order: input.order ?? count,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(
    tenant: TenantContext,
    cardId: string,
    linkId: string,
    input: UpdatePaymentLinkInput,
  ) {
    await this.cards.ensureEditable(tenant, cardId);
    return this.db.paymentLink.update({
      where: { id: linkId, cardId },
      data: {
        ...(input.platform !== undefined ? { platform: input.platform } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async remove(tenant: TenantContext, cardId: string, linkId: string) {
    await this.cards.ensureEditable(tenant, cardId);
    await this.db.paymentLink.softDelete({ id: linkId, cardId });
    return { id: linkId, deleted: true };
  }

  async reorder(tenant: TenantContext, cardId: string, ids: string[]) {
    await this.cards.ensureEditable(tenant, cardId);
    await this.db.$transaction(
      ids.map((id, index) =>
        this.db.paymentLink.update({ where: { id, cardId }, data: { order: index } }),
      ),
    );
    return { ok: true as const };
  }
}
