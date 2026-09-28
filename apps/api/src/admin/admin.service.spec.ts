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
