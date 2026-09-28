import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';

/** How long after its last refresh a person still counts as on the card. */
export const PRESENCE_WINDOW_MS = 45_000;
/** Rows this old are gone for good; the next refresh tidies them away. */
const FORGET_AFTER_MS = 60 * 60_000;

export interface PresentPerson {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

/**
 * Who else has a card open in the Studio. The page refreshes its own row every
 * few seconds while it is open and gets back everyone else seen recently; the
 * rows live in the database so every API instance sees the same people.
 */
@Injectable()
export class CardPresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async beat(tenant: TenantContext, cardId: string, now = new Date()): Promise<PresentPerson[]> {
    // Scoped to the workspace, so a card of another workspace is not found.
    const card = await this.db.card.findFirst({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Card not found');

    await this.db.cardPresence.upsert({
      where: { cardId_userId: { cardId, userId: tenant.userId } },
      create: { orgId: tenant.orgId, cardId, userId: tenant.userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    const rows = await this.db.cardPresence.findMany({
      where: { cardId, userId: { not: tenant.userId }, lastSeenAt: { gte: new Date(now.getTime() - PRESENCE_WINDOW_MS) } },
      orderBy: { lastSeenAt: 'desc' },
      select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    await this.db.cardPresence.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - FORGET_AFTER_MS) } } });
    return rows.map((r) => r.user);
  }

  /** The page was closed: stop counting this person at once. */
  async leave(tenant: TenantContext, cardId: string) {
    await this.db.cardPresence.deleteMany({ where: { cardId, userId: tenant.userId } });
    return { ok: true };
  }
}
