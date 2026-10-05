import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AccountService } from './account.service';

type Mem = { role: string; org: { id: string; name: string } };

function make(opts: { memberships: Mem[]; others: Record<string, number>; otherOwners?: Record<string, number>; totp?: boolean; hash?: string | null }) {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string) => jest.fn(async (a: unknown) => ((calls[name] ??= []).push(a), { count: 1 }));
  const user = { email: 'Mona@x.com', name: 'Mona', passwordHash: opts.hash ?? null, totpEnabledAt: opts.totp ? new Date() : null };
  const tx = {
    organization: { updateMany: rec('org.updateMany') },
    card: { updateMany: rec('card.updateMany') },
    lead: { updateMany: rec('lead.updateMany') },
    task: { updateMany: rec('task.updateMany') },
    nfcTag: { updateMany: rec('nfcTag.updateMany') },
    membership: { updateMany: rec('membership.updateMany') },
    pushSubscription: { deleteMany: rec('push.deleteMany') },
    authSession: { deleteMany: rec('sessions.deleteMany') },
    personalAccessToken: { deleteMany: rec('pat.deleteMany') },
    leadAlertSettings: { deleteMany: rec('alerts.deleteMany') },
    notificationPreference: { deleteMany: rec('prefs.deleteMany') },
    notification: { deleteMany: rec('notif.deleteMany') },
    user: { update: rec('user.update') },
  };
  const prisma = {
    client: {
      user: { findFirst: jest.fn().mockResolvedValue(user), findFirstOrThrow: jest.fn().mockResolvedValue(user) },
      membership: {
        findMany: jest.fn().mockResolvedValue(opts.memberships),
        count: jest.fn(async ({ where }: { where: { orgId: string; role?: string } }) => (where.role ? opts.otherOwners?.[where.orgId] ?? 0 : opts.others[where.orgId] ?? 0)),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const billing = { stopRenewals: jest.fn().mockResolvedValue(false) };
  const twoFactor = { check: jest.fn().mockResolvedValue('app') };
  const service = new AccountService(prisma as never, mail as never, billing as never, twoFactor as never);
  return { service, calls, mail, billing, twoFactor };
}

const solo: Mem = { role: 'OWNER', org: { id: 'o_solo', name: 'Mine' } };
const shared: Mem = { role: 'EMPLOYEE', org: { id: 'o_team', name: 'Acme' } };
const owned: Mem = { role: 'OWNER', org: { id: 'o_owned', name: 'Nile' } };

describe('AccountService', () => {
  it('sorts workspaces into deleted with it, left, and blocking', async () => {
    const { service } = make({ memberships: [solo, shared, owned], others: { o_team: 4, o_owned: 2 } });
    const p = await service.preview('u1');
    expect(p.deletedWithIt).toEqual([solo.org]);
    expect(p.leaving).toEqual([{ ...shared.org, role: 'EMPLOYEE' }]);
    expect(p.blockers).toEqual([{ ...owned.org, members: 2 }]);
  });

  it('refuses while they are the last owner of a workspace others use', async () => {
    const { service, calls } = make({ memberships: [owned], others: { o_owned: 2 } });
    await expect(service.delete('u1', { confirmEmail: 'mona@x.com' })).rejects.toThrow('Make someone else an owner of Nile first, or remove its other members');
    expect(calls['user.update']).toBeUndefined();
  });

  it('lets a co-owned workspace go without blocking', async () => {
    const { service } = make({ memberships: [owned], others: { o_owned: 2 }, otherOwners: { o_owned: 1 } });
    expect((await service.preview('u1')).blockers).toEqual([]);
  });

  it('needs the address typed out, the password, and the two-step code', async () => {
    const hash = await bcrypt.hash('secret-pass', 4);
    const a = make({ memberships: [], others: {}, hash });
    await expect(a.service.delete('u1', { confirmEmail: 'other@x.com', password: 'secret-pass' })).rejects.toThrow(BadRequestException);
    await expect(a.service.delete('u1', { confirmEmail: 'mona@x.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    const b = make({ memberships: [], others: {}, totp: true });
    await expect(b.service.delete('u1', { confirmEmail: 'mona@x.com' })).rejects.toThrow('Enter a code from your authenticator app');
    await b.service.delete('u1', { confirmEmail: 'mona@x.com', code: '123456' });
    expect(b.twoFactor.check).toHaveBeenCalledWith('u1', '123456');
  });

  it('deletes the solo workspace, leaves the shared one, and erases the person', async () => {
    const { service, calls, mail, billing } = make({ memberships: [solo, shared], others: { o_team: 3 } });
    await expect(service.delete('u1', { confirmEmail: ' MONA@x.com ' })).resolves.toEqual({ ok: true, workspacesDeleted: 1 });
    expect(calls['org.updateMany']![0]).toMatchObject({ where: { id: { in: ['o_solo'] } } });
    expect(calls['card.updateMany']![0]).toMatchObject({ where: { ownerId: 'u1', orgId: { notIn: ['o_solo'] } }, data: { isPublished: false } });
    expect(calls['lead.updateMany']![0]).toMatchObject({ data: { assignedTo: null } });
    const erased = (calls['user.update']![0] as { data: Record<string, unknown> }).data;
    expect(erased).toMatchObject({ email: 'deleted-u1@deleted.invalid', name: null, passwordHash: null, googleId: null });
    expect(erased.deletedAt).toBeInstanceOf(Date);
    expect(billing.stopRenewals).toHaveBeenCalledWith('o_solo');
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'Mona@x.com' }));
  });
});
