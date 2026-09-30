import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { LeadsService } from './leads.service';

/**
 * A member works on their own leads only — the ones assigned to them and the
 * ones their cards brought in. Anyone above sees the whole org's leads.
 */
const as = (role: string) => ({ orgId: 'o1', userId: 'u1', role }) as TenantContext;
const own = { OR: [{ assignedTo: 'u1' }, { card: { ownerId: 'u1' } }] };

function setup(found: unknown = null) {
  const db = {
    lead: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => found) },
    leadActivity: { create: jest.fn(async () => ({})) },
  };
  const service = new LeadsService({ client: db } as never, {} as never, {} as never, new ConfigService({}), {} as never, {} as never, {} as never);
  return { service, db };
}

describe('lead visibility', () => {
  it('limits a member to their own leads and lets managers see all', async () => {
    const { service, db } = setup();
    await service.list(as('EMPLOYEE'));
    expect(db.lead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: own }));
    for (const role of ['MANAGER', 'ADMIN', 'OWNER']) {
      await service.list(as(role));
      expect(db.lead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
    }
  });

  it('applies the same rule to one lead and to writing on it', async () => {
    const { service, db } = setup();
    await expect(service.findOne(as('EMPLOYEE'), 'l9')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.lead.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'l9', ...own } }));
    await expect(service.addActivity(as('EMPLOYEE'), 'l9', { type: 'NOTE', note: 'x' } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(as('EMPLOYEE'), 'l9', { value: 5 })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.leadActivity.create).not.toHaveBeenCalled();
  });
});
