import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma/prisma.service';

function makeService(overrides: Record<string, unknown> = {}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    client: {
      auditLog: { findMany },
      ...overrides,
    },
  } as unknown as PrismaService;
  return { service: new AdminService(prisma), findMany };
}

describe('AdminService.getAuditLogs', () => {
  it('searches the whole log, not just what was already loaded', async () => {
    const { service, findMany } = makeService();
    await service.getAuditLogs('  suspend ');
    const where = findMany.mock.calls[0][0].where;
    // Trimmed, case-insensitive, across action, target, actor and workspace.
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { action: { contains: 'suspend', mode: 'insensitive' } },
        { actor: { email: { contains: 'suspend', mode: 'insensitive' } } },
        { org: { name: { contains: 'suspend', mode: 'insensitive' } } },
      ]),
    );
  });

  it('applies no filter when the search is empty', async () => {
    const { service, findMany } = makeService();
    await service.getAuditLogs('   ');
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('names the workspace an entry belongs to', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      { id: 'a1', action: 'member.added', targetType: 'user', targetId: 'u1', createdAt: new Date(0), actor: null, orgId: 'o1', org: { name: 'Acme' }, metadata: null },
    ]);
    const [row] = await service.getAuditLogs('');
    expect(row).toMatchObject({ orgId: 'o1', orgName: 'Acme', actor: null });
  });
});

describe('accounts the console creates', () => {
  function withNobody() {
    const orgCreate = jest.fn();
    const userCreate = jest.fn();
    const { service } = makeService({
      organization: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ id: 'o1' }), create: orgCreate },
      user: { findFirst: jest.fn().mockResolvedValue(null), create: userCreate },
    });
    return { service, orgCreate, userCreate };
  }

  it('never creates an owner with a default password', async () => {
    // A typo in the owner's email used to create an account anyone could open
    // with the well-known default password.
    const { service, orgCreate, userCreate } = withNobody();
    await expect(service.createOrganization({ name: 'Acme', ownerEmail: 'typo@acme.co' }, 'admin')).rejects.toThrow(/Set a password/);
    expect(userCreate).not.toHaveBeenCalled();
    expect(orgCreate).not.toHaveBeenCalled();
  });

  it('refuses a short password for a new account', async () => {
    const { service, userCreate } = withNobody();
    await expect(service.createOrganization({ name: 'Acme', ownerEmail: 'new@acme.co', ownerPassword: 'short' }, 'admin')).rejects.toThrow(/at least 8/);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('asks for a password before handing a workspace to someone new', async () => {
    const { service, userCreate } = withNobody();
    await expect(service.updateOrganizationOwner('o1', { ownerEmail: 'new@acme.co' }, 'admin')).rejects.toThrow(/Set a password/);
    expect(userCreate).not.toHaveBeenCalled();
  });
});

describe('AdminService deleting and restoring a workspace', () => {
  function make(org: Record<string, unknown> | null) {
    const prisma = {
      client: {
        organization: {
          findUnique: jest.fn().mockResolvedValue(org),
          findFirst: jest.fn().mockResolvedValue(org),
          update: jest.fn().mockResolvedValue({}),
        },
        auditLog: { create: jest.fn() },
      },
    };
    const billing = { stopRenewals: jest.fn().mockResolvedValue(true) };
    return { service: new AdminService(prisma as never, billing as never), prisma, billing };
  }

  it('hides the workspace, stops its renewals and says when it will be erased', async () => {
    const { service, prisma, billing } = make({ id: 'o1', name: 'Acme' });
    const r = await service.deleteOrganization('o1', 'admin1');
    expect(prisma.client.organization.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { deletedAt: expect.any(Date) } });
    expect(billing.stopRenewals).toHaveBeenCalledWith('o1');
    expect(r).toMatchObject({ success: true, renewalsStopped: true });
    expect(new Date(r.purgeAt).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
  });

  it('restores only a workspace that was deleted', async () => {
    const { service, prisma } = make({ id: 'o1', name: 'Acme' });
    await service.restoreOrganization('o1', 'admin1');
    expect(prisma.client.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', deletedAt: { not: null } } }));
    expect(prisma.client.organization.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { deletedAt: null } });

    const none = make(null);
    await expect(none.service.restoreOrganization('o2', 'admin1')).rejects.toThrow('Organization not found');
  });
});
