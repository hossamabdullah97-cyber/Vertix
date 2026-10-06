import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';

const tenant = { orgId: 'o1', userId: 'admin', role: 'ADMIN' };

function setup(opts: { kind?: string; member?: object | null; role?: object | null; dup?: boolean } = {}) {
  const tx = {
    customRole: { update: jest.fn(async () => ({ id: 'r1', name: 'Sales lead', description: null, base: 'MANAGER', capabilities: ['billing:full'], createdAt: new Date(), _count: { memberships: 2 } })) },
    membership: { updateMany: jest.fn(async () => ({ count: 2 })) },
  };
  const db = {
    organization: { findUnique: jest.fn(async () => ({ kind: opts.kind ?? 'TEAM' })) },
    customRole: {
      create: jest.fn(async ({ data }: { data: object }) => {
        if (opts.dup) throw Object.assign(new Error('dup'), { code: 'P2002' });
        return { id: 'r1', createdAt: new Date(), _count: { memberships: 0 }, description: null, ...data };
      }),
      findFirst: jest.fn(async () => (opts.role === undefined ? { id: 'r1', name: 'Sales lead', base: 'MANAGER' } : opts.role)),
      delete: jest.fn(async () => ({})),
    },
    membership: {
      findFirst: jest.fn(async () => (opts.member === undefined ? { id: 'm1', userId: 'u2', role: 'EMPLOYEE' } : opts.member)),
      update: jest.fn(async ({ data }: { data: object }) => ({ id: 'm1', ...data })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: jest.fn(async () => undefined) };
  return { service: new CustomRolesService({ client: db } as never, audit as never), db, tx, audit };
}

const input = { name: 'Sales lead', base: 'MANAGER' as const, capabilities: ['billing:full', 'billing:full', 'teams:basic'] };

describe('custom roles', () => {
  it('are made in company workspaces, once per name, and logged', async () => {
    const { service, db, audit } = setup();
    const r = await service.create(tenant as never, input);
    expect(db.customRole.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orgId: 'o1', base: 'MANAGER', capabilities: ['billing:full', 'teams:basic'] }) }));
    expect(r).toMatchObject({ name: 'Sales lead', members: 0 });
    expect(audit.log).toHaveBeenCalledWith(tenant, 'role.created', expect.anything());
    await expect(setup({ kind: 'PERSONAL' }).service.create(tenant as never, input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ dup: true }).service.create(tenant as never, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('move their holders to a new base role when it changes', async () => {
    const { service, tx } = setup();
    await service.update(tenant as never, 'r1', { ...input, base: 'EMPLOYEE' });
    expect(tx.membership.updateMany).toHaveBeenCalledWith({ where: { customRoleId: 'r1' }, data: { role: 'EMPLOYEE' } });
  });

  it('are given with their base role, and taken away leaving it', async () => {
    const { service, db } = setup();
    await service.assign(tenant as never, 'm1', 'r1');
    expect(db.membership.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { customRoleId: 'r1', role: 'MANAGER' } }));
    await service.assign(tenant as never, 'm1', null);
    expect(db.membership.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { customRoleId: null } }));
  });

  it('are never given to yourself or to an owner', async () => {
    await expect(setup({ member: { id: 'm0', userId: 'admin', role: 'ADMIN' } }).service.assign(tenant as never, 'm0', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ member: { id: 'm9', userId: 'u9', role: 'OWNER' } }).service.assign(tenant as never, 'm9', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
