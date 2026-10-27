import { AnalyticsService } from './analytics.service';

/** A card's own people opening it are not visitors, and their browser is remembered as theirs. */
function setup(insider: boolean) {
  const db = {
    card: { findFirst: jest.fn(async () => ({ id: 'c1', orgId: 'o1', ownerId: insider ? 'u1' : 'someone' })) },
    membership: { findFirst: jest.fn(async () => (insider ? { id: 'm1' } : null)) },
    visitor: { upsert: jest.fn(async () => ({ id: 'vis1' })) },
    event: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    lead: { findMany: jest.fn(async () => []) },
  };
  const service = new AnalyticsService({ client: db } as never, { emit: jest.fn(async () => undefined) } as never);
  return { service, db };
}

describe("a workspace's own people", () => {
  it('opening the card are not counted, and their browser is marked as theirs', async () => {
    const { service, db } = setup(true);
    await service.track('jane', 'VIEW', 'browser-123', { viewerId: 'u1' });
    expect(db.event.create).not.toHaveBeenCalled();
    expect(db.visitor.upsert).toHaveBeenCalledWith({ where: { anonymousId: 'browser-123' }, update: { userId: 'u1' }, create: { anonymousId: 'browser-123', userId: 'u1' } });
  });

  it('signed in elsewhere, are counted like anyone, and their browser is not marked', async () => {
    const { service, db } = setup(false);
    await service.track('jane', 'VIEW', 'browser-123', { viewerId: 'u1' });
    expect(db.event.create).toHaveBeenCalled();
    for (const [arg] of db.visitor.upsert.mock.calls as unknown as [{ update: Record<string, unknown> }][]) expect(arg.update.userId).toBeUndefined();
  });
});
