import { LeadFeedService } from './lead-feed.service';

const T = (min: number) => new Date(Date.UTC(2026, 9, 7, 10, 0) + min * 60_000);
const lead = { id: 'l1', name: 'Mona', company: 'Acme' };

function make(rows: { activities?: unknown[]; leads?: unknown[]; tasks?: unknown[]; visitors?: unknown[]; views?: unknown[] } = {}) {
  const db = {
    leadActivity: { findMany: jest.fn(async (_a: unknown) => rows.activities ?? []) },
    lead: {
      findMany: jest.fn(async (a: { where: { visitorId?: unknown } }) => (a.where.visitorId ? rows.visitors ?? [] : rows.leads ?? [])),
    },
    task: { findMany: jest.fn(async (_a: unknown) => rows.tasks ?? []) },
    event: { findMany: jest.fn(async (_a: unknown) => rows.views ?? []) },
  };
  const notes = { authors: jest.fn(async () => new Map([['u1', { id: 'u1', name: 'Sara', avatarUrl: null }]])) };
  return { service: new LeadFeedService({ client: db } as never, notes as never), db };
}

const viewer = { orgId: 'o1', userId: 'u1', role: 'EMPLOYEE' as const };

describe('the activity feed', () => {
  it('puts what happened across the leads in one list, newest first', async () => {
    const { service } = make({
      activities: [
        { id: 'a2', type: 'CALL', metadata: { by: 'u1', note: 'Called' }, createdAt: T(30), lead },
        // The empty note a sent form leaves: the capture says it.
        { id: 'a1', type: 'NOTE', metadata: { intent: 'CONTACT', note: null }, createdAt: T(0), lead },
      ],
      leads: [{ ...lead, source: 'card_form', createdAt: T(0), card: { slug: 'omar', vcardData: { fullName: 'Omar' } } }],
      tasks: [{ id: 't1', title: 'Send offer', completedAt: T(60), assignedTo: 'u1', lead }],
      visitors: [{ ...lead, visitorId: 'v1', createdAt: T(0) }],
      views: [
        { id: 'e2', visitorId: 'v1', createdAt: T(24 * 60), card: { slug: 'omar', vcardData: null } },
        // The visit the details were left on.
        { id: 'e1', visitorId: 'v1', createdAt: T(-2), card: { slug: 'omar', vcardData: null } },
      ],
    });
    const { items, next } = await service.feed(viewer);
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['returned:visit-e2-l1', 'task:task-done-t1', 'activity:a2', 'captured:created-l1']);
    expect(items[1]).toMatchObject({ by: { name: 'Sara' } });
    expect(items[3]).toMatchObject({ card: 'Omar', source: 'card_form' });
    expect(next).toBeNull();
  });

  it('a member sees only their leads, and the workspace is named on the related filter', async () => {
    const { service, db } = make();
    await service.feed(viewer, { before: T(5) });
    const where = (db.leadActivity.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ createdAt: { lte: T(5) }, lead: { orgId: 'o1', deletedAt: null, OR: [{ assignedTo: 'u1' }, { card: { ownerId: 'u1' } }] } });
  });

  it('asks only for the kind wanted', async () => {
    const { service, db } = make();
    await service.feed(viewer, { kind: 'visits' });
    expect(db.leadActivity.findMany).not.toHaveBeenCalled();
    expect(db.task.findMany).not.toHaveBeenCalled();
    await service.feed(viewer, { kind: 'conversations' });
    expect((db.leadActivity.findMany.mock.calls[0]![0] as { where: { type: unknown } }).where.type).toEqual({ in: ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING'] });
  });

  it('says where the next page starts when there may be more', async () => {
    const tasks = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, title: 'x', completedAt: T(10 - i), assignedTo: null, lead }));
    const { service } = make({ tasks });
    const { items, next } = await service.feed(viewer, { kind: 'tasks', limit: 3 });
    expect(items).toHaveLength(3);
    expect(next).toBe(T(8).toISOString());
  });
});
