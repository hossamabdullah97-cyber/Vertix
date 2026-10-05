import { BadRequestException } from '@nestjs/common';
import { ADMIN_ORG, getTenantContext, runWithTenant } from '@vertex/db';
import { OrganizationsService } from './organizations.service';
import { MembersService, PERSONAL_HAS_NO_TEAM } from './members.service';

/** A person's own workspace and a company's: what each can become, and what a personal one refuses. */

function orgs(opts: { kind?: 'PERSONAL' | 'TEAM'; ownsPersonal?: boolean; user?: { name: string | null; email: string } } = {}) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    organization: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: 'org_p', ...data })) },
    membership: { create: jest.fn(async () => ({ scope: getTenantContext()?.orgId })) },
    pipelineStage: { createMany: jest.fn(async () => ({ count: 7 })) },
  };
  const client = {
    organization: {
      findUnique: jest.fn(async () => (opts.kind ? { kind: opts.kind } : null)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'org1', ...data })),
    },
    membership: { findFirst: jest.fn(async () => (opts.ownsPersonal ? { orgId: 'org_old' } : null)) },
    user: { findUnique: jest.fn(async () => opts.user ?? { name: 'Mona Adel', email: 'mona@example.com' }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new OrganizationsService({ client } as never), client, tx, created };
}

describe('making a personal workspace a company’s', () => {
  it('turns it into a team workspace under the name given', async () => {
    const { service, client } = orgs({ kind: 'PERSONAL' });
    await expect(service.convertToTeam('org1', '  Nile Studio ')).resolves.toMatchObject({ kind: 'TEAM', name: 'Nile Studio' });
    expect(client.organization.update.mock.calls[0][0]).toMatchObject({ where: { id: 'org1' }, data: { kind: 'TEAM', name: 'Nile Studio' } });
  });

  it('goes one way only', async () => {
    const { service, client } = orgs({ kind: 'TEAM' });
    await expect(service.convertToTeam('org1', 'X')).rejects.toBeInstanceOf(BadRequestException);
    expect(client.organization.update).not.toHaveBeenCalled();
  });
});

describe('a personal workspace for someone who has only their company’s', () => {
  it('is made in their name, owned by them, with the sales stages ready', async () => {
    const { service, tx, created } = orgs();
    await expect(service.createPersonal('u1')).resolves.toMatchObject({ kind: 'PERSONAL', name: 'Mona Adel' });
    expect(created[0]).toMatchObject({ name: 'Mona Adel', kind: 'PERSONAL' });
    expect(tx.membership.create).toHaveBeenCalledWith({ data: { userId: 'u1', orgId: 'org_p', role: 'OWNER' } });
    expect(tx.pipelineStage.createMany).toHaveBeenCalled();
  });

  it('is made outside the company workspace the request came from', async () => {
    const { service, tx } = orgs();
    await runWithTenant({ orgId: 'org_company', userId: 'u1', role: 'EMPLOYEE' }, () => service.createPersonal('u1'));
    // The company's scope would put the membership in the company instead.
    await expect(tx.membership.create.mock.results[0]!.value).resolves.toEqual({ scope: ADMIN_ORG });
  });

  it('takes the email’s name when they gave none', async () => {
    const { service, created } = orgs({ user: { name: null, email: 'omar.adel@example.com' } });
    await service.createPersonal('u1');
    expect(created[0]).toMatchObject({ name: 'omar.adel' });
  });

  it('is one each', async () => {
    const { service, tx } = orgs({ ownsPersonal: true });
    await expect(service.createPersonal('u1')).rejects.toThrow('You already have a personal workspace.');
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
});

describe('the switcher’s list', () => {
  it('has every workspace the person is in, not only the one the request came from', async () => {
    const findMany = jest.fn(async (_args: unknown) => (getTenantContext()?.orgId === ADMIN_ORG ? [{ org: { id: 'a' }, role: 'EMPLOYEE' }, { org: { id: 'b' }, role: 'OWNER' }] : [{ org: { id: 'a' }, role: 'EMPLOYEE' }]));
    const service = new OrganizationsService({ client: { membership: { findMany } } } as never);
    const list = await runWithTenant({ orgId: 'a', userId: 'u1', role: 'EMPLOYEE' }, () => service.listForUser('u1'));
    expect(list.map((m) => m.org.id)).toEqual(['a', 'b']);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { userId: 'u1', status: 'ACTIVE', org: { deletedAt: null } } });
  });
});

describe('a personal workspace has no team', () => {
  it('turns away an invitation, saying how to get one', async () => {
    const prisma = { client: { organization: { findUnique: jest.fn(async () => ({ kind: 'PERSONAL' })) }, user: { findUnique: jest.fn() } } };
    const members = new MembersService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(members.invite({ orgId: 'org1', userId: 'u1', role: 'OWNER' }, { email: 'a@b.co', role: 'EMPLOYEE' } as never)).rejects.toThrow(PERSONAL_HAS_NO_TEAM);
    // Not even the email check ran: nothing else was looked up.
    expect(prisma.client.user.findUnique).not.toHaveBeenCalled();
  });
});
