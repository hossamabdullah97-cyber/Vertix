import { NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { AnalyticsService } from './analytics.service';

/** A member's reports cover their own cards and chips; managers see the workspace. */
const as = (role: string) => ({ orgId: 'o1', userId: 'u1', role }) as TenantContext;

function setup() {
  const db = {
    event: { groupBy: jest.fn(async () => []) },
    lead: { count: jest.fn(async () => 0) },
    card: { findFirst: jest.fn(async () => null) },
    nfcTag: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => [{ count: 0 }]),
  };
  const service = new AnalyticsService({ client: db } as never, {} as never);
  return { service, db };
}

describe('analytics scope', () => {
  it('knows whose reports to show', () => {
    expect(AnalyticsService.ownerOf(as('EMPLOYEE'))).toBe('u1');
    for (const role of ['MANAGER', 'ADMIN', 'OWNER']) expect(AnalyticsService.ownerOf(as(role))).toBeUndefined();
  });

  it("counts only a member's own cards and leads", async () => {
    const { service, db } = setup();
    await service.overview('o1', new Date(0), new Date(), 'u1');
    expect(db.event.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ card: { ownerId: 'u1' } }) }));
    expect(db.lead.count).toHaveBeenCalledWith({ where: expect.objectContaining({ OR: [{ assignedTo: 'u1' }, { card: { ownerId: 'u1' } }] }) });
    const sql = (db.$queryRaw.mock.calls[0] as unknown[])[0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain('"ownerId"');
    expect(sql.values).toContain('u1');
  });

  it('leaves the whole workspace to managers', async () => {
    const { service, db } = setup();
    await service.overview('o1', new Date(0), new Date());
    expect(db.event.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ card: expect.anything() }) }));
    const sql = (db.$queryRaw.mock.calls[0] as unknown[])[0] as { sql: string };
    expect(sql.sql).not.toContain('"ownerId"');
  });

  it("hides a colleague's card stats from a member", async () => {
    const { service } = setup();
    await expect(service.cardStats('c2', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('team standings', () => {
  it('credits a client to the chip that was tapped, else to the card they came through', async () => {
    const user = (id: string) => ({ id, name: id, email: `${id}@x.com`, avatarUrl: null });
    const db = {
      nfcTag: { findMany: jest.fn(async () => [{ id: 't1', assignedUserId: 'sara' }]) },
      card: { findMany: jest.fn(async () => [{ id: 'c1', ownerId: 'omar' }, { id: 'c2', ownerId: 'sara' }]) },
      pipelineStage: { findMany: jest.fn(async () => [{ id: 'won' }]) },
      user: { findMany: jest.fn(async () => [user('sara'), user('omar')]) },
      event: {
        groupBy: jest.fn(async () => [{ tagId: 't1', _count: { _all: 4 } }]),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ tagId: 't1', visitorId: 'v1' }])
          .mockResolvedValueOnce([{ cardId: 'c1', visitorId: 'v2' }, { cardId: 'c1', visitorId: 'v3' }, { cardId: 'c2', visitorId: 'v1' }]),
      },
      lead: {
        findMany: jest.fn(async () => [
          { tagId: 't1', cardId: 'c1', stageId: 'won', value: 500 }, // Sara's chip on Omar's card: Sara's
          { tagId: null, cardId: 'c1', stageId: null, value: 0 }, // through Omar's link: Omar's
          { tagId: null, cardId: 'c1', stageId: 'won', value: 200 },
        ]),
      },
    };
    const service = new AnalyticsService({ client: db } as never, {} as never);
    const rows = await service.memberPerformance('o1', new Date(0), new Date());
    const by = Object.fromEntries(rows.map((r) => [r.user.id, r]));
    // v1 tapped Sara's chip and opened her card's link too: one person.
    expect(by.sara).toMatchObject({ tags: 1, scans: 4, visitors: 1, leads: 1, wonLeads: 1, wonValue: 500 });
    expect(by.omar).toMatchObject({ tags: 0, scans: 0, visitors: 2, leads: 2, wonLeads: 1, wonValue: 200 });
  });
});
