import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OccasionsService } from './occasions.service';

const tenant = { orgId: 'org_acme', userId: 'u1', role: 'MANAGER' } as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  orgId: 'org_acme',
  name: 'Cairo ICT',
  startsOn: new Date('2026-09-19T00:00:00Z'),
  endsOn: new Date('2026-09-21T00:00:00Z'),
  ...over,
});

function make(found: unknown = row()) {
  const occasion = {
    findMany: jest.fn().mockResolvedValue([row()]),
    findFirst: jest.fn().mockResolvedValue(found),
    create: jest.fn(async ({ data }) => ({ id: 'o2', ...data })),
    update: jest.fn(async ({ data }) => ({ ...row(), ...data })),
    delete: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const svc = new OccasionsService({ client: { occasion } } as never, audit as never);
  return { svc, occasion, audit };
}

describe('OccasionsService', () => {
  it('lists occasions as whole days', async () => {
    const { svc } = make();
    await expect(svc.list()).resolves.toEqual([{ id: 'o1', name: 'Cairo ICT', startsOn: '2026-09-19', endsOn: '2026-09-21' }]);
  });

  it('stores a new occasion as UTC days, for its workspace, and logs it', async () => {
    const { svc, occasion, audit } = make();
    const out = await svc.create(tenant, { name: 'Launch', startsOn: '2026-10-01', endsOn: '2026-10-01' });
    expect(occasion.create.mock.calls[0][0].data).toMatchObject({
      orgId: 'org_acme',
      startsOn: new Date('2026-10-01T00:00:00Z'),
      endsOn: new Date('2026-10-01T00:00:00Z'),
      createdById: 'u1',
    });
    expect(out).toEqual({ id: 'o2', name: 'Launch', startsOn: '2026-10-01', endsOn: '2026-10-01' });
    expect(audit.log).toHaveBeenCalledWith(tenant, 'occasion.created', expect.anything());
  });

  it('refuses an occasion that ends before it starts', async () => {
    const { svc, occasion } = make();
    await expect(svc.create(tenant, { name: 'x', startsOn: '2026-10-02', endsOn: '2026-10-01' })).rejects.toThrow(BadRequestException);
    expect(occasion.create).not.toHaveBeenCalled();
  });

  it('checks a moved date against the date it keeps', async () => {
    const { svc, occasion } = make();
    // Stored 19–21 Sep; moving only the end to the 18th would end before the start.
    await expect(svc.update(tenant, 'o1', { endsOn: '2026-09-18' })).rejects.toThrow(BadRequestException);
    await svc.update(tenant, 'o1', { endsOn: '2026-09-22' });
    expect(occasion.update.mock.calls[0][0].data).toMatchObject({
      startsOn: new Date('2026-09-19T00:00:00Z'),
      endsOn: new Date('2026-09-22T00:00:00Z'),
    });
  });

  it('answers 404 for an occasion it cannot see', async () => {
    const { svc, occasion } = make(null);
    await expect(svc.update(tenant, 'nope', { name: 'x' })).rejects.toThrow(NotFoundException);
    await expect(svc.remove(tenant, 'nope')).rejects.toThrow(NotFoundException);
    expect(occasion.delete).not.toHaveBeenCalled();
  });
});
