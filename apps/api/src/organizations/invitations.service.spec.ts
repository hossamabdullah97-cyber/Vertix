import { NotFoundException } from '@nestjs/common';
import { ADMIN_ORG, getTenantContext } from '@vertex/db';
import { InvitationsService, INVITATION_CLOSED } from './invitations.service';
import { workspaceLink } from '../common/workspace-link';

/** Joining a workspace is the invitee's choice, made signed in. */

function lazy<T>(run: () => T): PromiseLike<T> {
  return { then: (ok, fail) => Promise.resolve().then(run).then(ok, fail) };
}

function setup(open: { id: string; role: string } | null = { id: 'm1', role: 'EMPLOYEE' }) {
  const scopes: (string | undefined)[] = [];
  const membership = {
    findMany: jest.fn(async () => [{ role: 'EMPLOYEE', updatedAt: new Date('2026-10-05'), org: { id: 'org_nile', name: 'Nile Co', slug: 'nile-co', kind: 'TEAM', branding: null } }]),
    findFirst: jest.fn(async () => (scopes.push(getTenantContext()?.orgId), open)),
    // Lazy, as Prisma's are: the query runs, in whatever scope is current, only when awaited.
    update: jest.fn(() => lazy(() => (scopes.push(getTenantContext()?.orgId), {}))),
    softDelete: jest.fn(() => lazy(() => (scopes.push(getTenantContext()?.orgId), {}))),
  };
  const notification = { updateMany: jest.fn(async () => ({ count: 1 })) };
  const db = { membership, notification, user: { findUniqueOrThrow: jest.fn(async () => ({ name: 'Omar', email: 'omar@example.com' })) } };
  const audit = { log: jest.fn(async () => undefined) };
  const notifications = { notifyOrgAdmins: jest.fn(async () => undefined) };
  const webhooks = { emit: jest.fn(async () => 0) };
  const service = new InvitationsService({ client: db } as never, audit as never, notifications as never, webhooks as never);
  return { service, membership, audit, notifications, webhooks, scopes, notification };
}

describe('invitations', () => {
  it('lists the open ones, across workspaces', async () => {
    const { service, membership } = setup();
    await expect(service.list('u1')).resolves.toEqual([expect.objectContaining({ org: expect.objectContaining({ id: 'org_nile', name: 'Nile Co' }), role: 'EMPLOYEE' })]);
    expect(membership.findMany.mock.calls[0]).toBeDefined();
    expect((membership.findMany.mock.calls[0] as unknown[])[0]).toMatchObject({ where: { userId: 'u1', status: 'INVITED', org: { deletedAt: null, isActive: true } } });
  });

  it('accepting makes them a member, and tells the workspace', async () => {
    const { service, membership, audit, notifications, webhooks, scopes, notification } = setup();
    await expect(service.accept('u1', 'org_nile')).resolves.toEqual({ orgId: 'org_nile', role: 'EMPLOYEE' });
    expect(membership.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'ACTIVE' } });
    // Looked up and changed outside whichever workspace the request came from.
    expect(scopes).toEqual([ADMIN_ORG, ADMIN_ORG]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_nile', userId: 'u1' }), 'member.joined', expect.anything());
    expect(notifications.notifyOrgAdmins).toHaveBeenCalledWith('org_nile', 'u1', expect.objectContaining({ type: 'member.joined' }));
    expect(webhooks.emit).toHaveBeenCalledWith('org_nile', 'member.added', expect.objectContaining({ userId: 'u1' }));
    // The invitation's notification is done with.
    expect(notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', type: 'member.invited', metadata: { path: ['orgId'], equals: 'org_nile' } }) }));
  });

  it('declining removes the open place, and joins nothing', async () => {
    const { service, membership, notifications, scopes } = setup();
    await expect(service.decline('u1', 'org_nile')).resolves.toEqual({ orgId: 'org_nile', declined: true });
    expect(membership.softDelete).toHaveBeenCalledWith({ id: 'm1' });
    expect(scopes).toEqual([ADMIN_ORG, ADMIN_ORG]);
    expect(membership.update).not.toHaveBeenCalled();
    expect(notifications.notifyOrgAdmins).toHaveBeenCalledWith('org_nile', 'u1', expect.objectContaining({ type: 'member.declined' }));
  });

  it('cannot accept what is not open: a place already held, withdrawn, or someone else’s', async () => {
    const { service, membership } = setup(null);
    await expect(service.accept('u1', 'org_nile')).rejects.toThrow(new NotFoundException(INVITATION_CLOSED));
    expect((membership.findFirst.mock.calls[0] as unknown[])[0]).toMatchObject({ where: { userId: 'u1', orgId: 'org_nile', status: 'INVITED' } });
    expect(membership.update).not.toHaveBeenCalled();
  });
});

describe('a link that opens in its workspace', () => {
  it('adds the workspace to the address, keeping what is there', () => {
    expect(workspaceLink('/leads?lead=l1', 'org1')).toBe('/leads?lead=l1&w=org1');
    expect(workspaceLink('/dashboard', 'nile co')).toBe('/dashboard?w=nile%20co');
    expect(workspaceLink('/team#members', 'org1')).toBe('/team?w=org1#members');
    expect(workspaceLink('/notifications', null)).toBe('/notifications');
  });
});
