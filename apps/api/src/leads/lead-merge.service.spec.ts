import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadMergeService, mergedLead } from './lead-merge.service';

const row = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  name: null,
  email: null,
  phone: null,
  company: null,
  source: 'card_form',
  value: 0,
  score: 0,
  temperature: 'COLD' as const,
  stageId: null,
  assignedTo: null,
  cardId: null,
  tagId: null,
  firstContactedAt: null,
  lastContactedAt: null,
  createdAt: new Date('2026-09-10T10:00:00Z'),
  ...o,
});

describe('mergedLead', () => {
  it('keeps the kept lead first, fills gaps from the oldest other, and remembers what differed', () => {
    const keep = row('k', { name: 'Mona', email: 'mona@x.com', value: 500, temperature: 'WARM', createdAt: new Date('2026-09-20T00:00:00Z') });
    const older = row('o', { email: 'mona.work@x.com', phone: '0100', company: 'Nile', value: 2000, score: 40, createdAt: new Date('2026-09-01T00:00:00Z'), firstContactedAt: new Date('2026-09-02T00:00:00Z') });
    const newer = row('n', { name: 'Mona A.', temperature: 'HOT', lastContactedAt: new Date('2026-09-25T00:00:00Z'), company: 'Delta' });
    const { data, differing } = mergedLead(keep as never, [newer, older] as never);
    expect(data).toMatchObject({ name: 'Mona', email: 'mona@x.com', phone: '0100', company: 'Nile', value: 2000, score: 40, temperature: 'HOT' });
    expect(data.createdAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(data.firstContactedAt?.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(data.lastContactedAt?.toISOString()).toBe('2026-09-25T00:00:00.000Z');
    expect(differing).toEqual({ name: ['Mona A.'], email: ['mona.work@x.com'], company: ['Delta'] });
  });

  it('does not count the same number or address written differently as different', () => {
    const keep = row('k', { phone: '01001234567', email: 'Mona@X.com' });
    const { differing } = mergedLead(keep as never, [row('o', { phone: '+20 100 123 4567', email: 'mona@x.com' })] as never);
    expect(differing).toEqual({});
  });
});

describe('LeadMergeService.merge', () => {
  function make(rows: ReturnType<typeof row>[]) {
    const tx = {
      leadActivity: { updateMany: jest.fn(), create: jest.fn() },
      task: { updateMany: jest.fn() },
      lead: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = { client: { lead: { findMany: jest.fn().mockResolvedValue(rows) }, $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
    const webhooks = { emit: jest.fn().mockResolvedValue(undefined) };
    return { service: new LeadMergeService(prisma as never, webhooks as never), tx };
  }
  const viewer = { orgId: 'org', userId: 'u1', role: 'MANAGER' as const };

  it('moves history and tasks over, deletes the others, and records the merge', async () => {
    const { service, tx } = make([row('k', { name: 'Mona' }), row('d', { phone: '0100' })]);
    await expect(service.merge(viewer, 'k', ['d', 'k'])).resolves.toEqual({ id: 'k', merged: 1 });
    expect(tx.leadActivity.updateMany).toHaveBeenCalledWith({ where: { leadId: { in: ['d'] } }, data: { leadId: 'k' } });
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { leadId: { in: ['d'] } }, data: { leadId: 'k' } });
    expect(tx.lead.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['d'] } } });
    expect(tx.lead.update.mock.calls[0][0]).toMatchObject({ where: { id: 'k' }, data: { name: 'Mona', phone: '0100' } });
    expect(tx.leadActivity.create.mock.calls[0][0].data).toMatchObject({ leadId: 'k', type: 'MERGE' });
  });

  it('refuses leads the person cannot see, and a merge with nothing to merge', async () => {
    await expect(make([row('k')]).service.merge(viewer, 'k', ['hidden'])).rejects.toThrow(NotFoundException);
    await expect(make([row('k')]).service.merge(viewer, 'k', ['k'])).rejects.toThrow(BadRequestException);
  });
});

describe('LeadMergeService dismissals', () => {
  const viewer = { orgId: 'org', userId: 'u1', role: 'MANAGER' as const };
  function make(visible: number) {
    const prisma = {
      client: {
        lead: { count: jest.fn().mockResolvedValue(visible), findMany: jest.fn().mockResolvedValue([
          { id: 'b', email: null, phone: '0100 123 4567' },
          { id: 'a', email: null, phone: '+20 100 123 4567' },
          { id: 'c', email: 'x@y.com', phone: null },
          { id: 'd', email: 'X@y.com', phone: null },
        ]) },
        duplicateDismissal: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([{ key: 'a,b' }]) },
      },
    };
    return { service: new LeadMergeService(prisma as never, { emit: jest.fn() } as never), prisma };
  }

  it('saves the group for the whole workspace, under one key however it is ordered', async () => {
    const { service, prisma } = make(2);
    await expect(service.dismiss(viewer, ['b', 'a'])).resolves.toEqual({ key: 'a,b' });
    expect(prisma.client.duplicateDismissal.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId_key: { orgId: 'org', key: 'a,b' } } }));
  });

  it('refuses leads the person cannot see', async () => {
    await expect(make(1).service.dismiss(viewer, ['a', 'b'])).rejects.toThrow(NotFoundException);
  });

  it('leaves dismissed groups out of the duplicates', async () => {
    const groups = await make(0).service.duplicates(viewer);
    expect(groups.map((g) => g.leads.map((l) => l.id).sort().join(','))).toEqual(['c,d']);
  });
});
