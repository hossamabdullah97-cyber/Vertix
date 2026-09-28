import { NotFoundException } from '@nestjs/common';
import { CardPresenceService, PRESENCE_WINDOW_MS } from './card-presence.service';

const tenant = { orgId: 'org_acme', userId: 'me', role: 'EMPLOYEE' } as never;
const NOW = new Date('2026-09-28T12:00:00Z');

function make(card: unknown = { id: 'c1' }) {
  const mariam = { id: 'u2', name: 'Mariam', email: 'm@acme.co', avatarUrl: null };
  const db = {
    card: { findFirst: jest.fn().mockResolvedValue(card) },
    cardPresence: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ user: mariam }]),
      deleteMany: jest.fn(),
    },
  };
  return { svc: new CardPresenceService({ client: db } as never), db, mariam };
}

describe('CardPresenceService', () => {
  it('refreshes my row, for my workspace, and returns the others seen recently', async () => {
    const { svc, db, mariam } = make();
    await expect(svc.beat(tenant, 'c1', NOW)).resolves.toEqual([mariam]);
    expect(db.cardPresence.upsert).toHaveBeenCalledWith({
      where: { cardId_userId: { cardId: 'c1', userId: 'me' } },
      create: { orgId: 'org_acme', cardId: 'c1', userId: 'me', lastSeenAt: NOW },
      update: { lastSeenAt: NOW },
    });
    const where = db.cardPresence.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ cardId: 'c1', userId: { not: 'me' } });
    expect(where.lastSeenAt.gte).toEqual(new Date(NOW.getTime() - PRESENCE_WINDOW_MS));
  });

  it('tidies rows nobody has refreshed for an hour', async () => {
    const { svc, db } = make();
    await svc.beat(tenant, 'c1', NOW);
    expect(db.cardPresence.deleteMany).toHaveBeenCalledWith({ where: { lastSeenAt: { lt: new Date(NOW.getTime() - 3_600_000) } } });
  });

  it('refuses a card it cannot see, and records nothing', async () => {
    const { svc, db } = make(null);
    await expect(svc.beat(tenant, 'other-workspace-card', NOW)).rejects.toThrow(NotFoundException);
    expect(db.cardPresence.upsert).not.toHaveBeenCalled();
  });

  it('drops me from the card when I leave', async () => {
    const { svc, db } = make();
    await svc.leave(tenant, 'c1');
    expect(db.cardPresence.deleteMany).toHaveBeenCalledWith({ where: { cardId: 'c1', userId: 'me' } });
  });
});
