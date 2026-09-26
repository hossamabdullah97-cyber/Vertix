import { ConflictException } from '@nestjs/common';
import { MembersService } from './members.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokensService } from '../mail/tokens.service';
import type { MailService } from '../mail/mail.service';
import type { LimitsService } from '../billing/limits.service';
import type { AuditService } from './audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { WebhookService } from '../integrations/webhook.service';
import type { TenantContext } from '@vertex/db';

/**
 * The invitation boundary. An invited employee sets their own password through
 * a one-time link — the inviter never picks one. The cases that matter most are
 * the ones where a half-finished invitation already exists: getting those wrong
 * strands the account as unreachable rather than failing loudly.
 */

const TENANT: TenantContext = {
  orgId: 'org_acme',
  userId: 'u_owner',
  role: 'OWNER',
};

type Deps = {
  user?: Partial<Record<string, jest.Mock>>;
  membership?: Partial<Record<string, jest.Mock>>;
  tokens?: Partial<Record<string, jest.Mock>>;
};

/** Wires MembersService with the smallest believable doubles. */
function makeService(d: Deps = {}) {
  const prisma = {
    client: {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'u_new' }),
        update: jest.fn().mockResolvedValue({ id: 'u_pending' }),
        ...d.user,
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        ...d.membership,
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }),
      },
      team: { findFirst: jest.fn().mockResolvedValue({ id: 't1' }) },
    },
  } as unknown as PrismaService;

  const tokens = {
    create: jest.fn().mockResolvedValue('raw_invite_token'),
    revokePending: jest.fn().mockResolvedValue(undefined),
    ...d.tokens,
  } as unknown as TokensService;

  const mail = {
    sendInvite: jest.fn().mockResolvedValue(true),
    sendAddedNotice: jest.fn().mockResolvedValue(true),
  } as unknown as MailService;

  const limits = { assertWithin: jest.fn() } as unknown as LimitsService;
  const config = { get: (_k: string, dflt?: string) => dflt ?? 'x' };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const notifications = { notify: jest.fn() } as unknown as NotificationsService;
  const webhooks = {
    emit: jest.fn().mockResolvedValue(undefined),
  } as unknown as WebhookService;

  const service = new MembersService(
    prisma,
    limits,
    tokens,
    mail,
    config as never,
    audit,
    notifications,
    webhooks,
  );
  return { service, prisma, tokens, mail, limits, audit, notifications };
}

/** Every `membership.create`/`update` call's data payload, in order. */
function membershipWrites(prisma: PrismaService) {
  const m = prisma.client.membership as unknown as {
    create: jest.Mock;
    update: jest.Mock;
  };
  return [...m.create.mock.calls, ...m.update.mock.calls].map(
    (c) => c[0].data as Record<string, unknown>,
  );
}

describe('MembersService.invite — a brand-new address', () => {
  it('creates an INVITED membership and emails a one-time link', async () => {
    const { service, prisma, tokens, mail } = makeService();

    await expect(service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' })).resolves.toEqual(
      { status: 'invited', email: 'a@b.co', emailSent: true },
    );

    expect(membershipWrites(prisma)[0]).toMatchObject({ status: 'INVITED' });
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INVITE', email: 'a@b.co', userId: 'u_new' }),
    );
    const link = (mail.sendInvite as unknown as jest.Mock).mock.calls[0][1];
    expect(link).toContain('/accept-invite?token=raw_invite_token');
  });

  it('never writes a password — the employee supplies it at accept time', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u_new' });
    const { service } = makeService({ user: { create } });

    await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(create.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
  });
});

describe('MembersService.invite — an account that was never activated', () => {
  /** A placeholder left by an earlier invitation: a row, but no password. */
  const pendingUser = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'u_pending', passwordHash: null }) } };

  it('resends the invitation instead of reporting the member as already added', async () => {
    const { service, tokens, mail } = makeService({
      ...pendingUser,
      membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm_pending' }) },
    });

    await expect(service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' })).resolves.toEqual(
      { status: 'invited', email: 'a@b.co', emailSent: true },
    );
    expect(tokens.create).toHaveBeenCalled();
    expect(mail.sendInvite).toHaveBeenCalled();
  });

  it('retires the superseded link so only the newest invitation works', async () => {
    const { service, tokens } = makeService({
      ...pendingUser,
      membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm_pending' }) },
    });

    await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(tokens.revokePending).toHaveBeenCalledWith('INVITE', 'u_pending');
  });

  it('does not charge the plan a second seat for a link it already sent', async () => {
    // Otherwise a full org could never resend, which is exactly when the
    // employee who lost their link needs one most.
    const { service, limits } = makeService({
      ...pendingUser,
      membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm_pending' }) },
    });

    await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(limits.assertWithin).toHaveBeenCalledWith('org_acme', 'members', 0);
  });

  it('is never activated without a password, even once its old membership is gone', async () => {
    // Removing the pending member soft-deletes the membership but leaves the
    // user row: re-inviting must not hand out access it cannot be used with.
    const { service, prisma, tokens } = makeService(pendingUser);

    await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    for (const write of membershipWrites(prisma)) {
      expect(write.status).not.toBe('ACTIVE');
    }
    expect(tokens.create).toHaveBeenCalled();
  });

  it('reuses the placeholder rather than creating a second account', async () => {
    const create = jest.fn();
    const { service, tokens } = makeService({
      user: { ...pendingUser.user, create },
    });

    await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(create).not.toHaveBeenCalled();
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u_pending' }),
    );
  });

  it('applies the role named by the newest invitation', async () => {
    const update = jest.fn().mockResolvedValue({});
    const { service } = makeService({
      ...pendingUser,
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm_pending' }),
        update,
      },
    });

    await service.invite(TENANT, { email: 'a@b.co', role: 'MANAGER' });

    expect(update.mock.calls[0][0].data).toMatchObject({
      role: 'MANAGER',
      status: 'INVITED',
    });
  });
});

describe('MembersService.invite — an already-activated account', () => {
  const activeUser = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u_real', passwordHash: '$2a$hash' }) },
  };

  it('is added straight away, with no invitation link needed', async () => {
    const { service, prisma, mail, tokens } = makeService(activeUser);

    await expect(service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' })).resolves.toEqual(
      { status: 'added', email: 'a@b.co', emailSent: true },
    );

    expect(membershipWrites(prisma)[0]).toMatchObject({ status: 'ACTIVE' });
    expect(mail.sendAddedNotice).toHaveBeenCalledWith('a@b.co', 'Acme');
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('is rejected when they already belong to the organization', async () => {
    const { service } = makeService({
      ...activeUser,
      membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) },
    });

    await expect(
      service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('MembersService.invite — the email fails to send', () => {
  /**
   * A delivery failure must never be reported as if the invite were fully
   * successful, and it must never crash the request either: the membership
   * and (for a new invite) its token are already committed by this point,
   * so the only honest response is "created, but not delivered."
   */

  it('still creates the membership, and tells the caller the email did not go out', async () => {
    const { service, prisma, mail } = makeService();
    (mail.sendInvite as unknown as jest.Mock).mockResolvedValue(false);

    const result = await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(result).toEqual({ status: 'invited', email: 'a@b.co', emailSent: false });
    expect(membershipWrites(prisma)[0]).toMatchObject({ status: 'INVITED' });
  });

  it('records the delivery outcome in the audit trail', async () => {
    const { service, audit, mail } = makeService();
    (mail.sendInvite as unknown as jest.Mock).mockResolvedValue(false);

    await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(audit.log).toHaveBeenCalledWith(
      TENANT,
      'member.invited',
      expect.objectContaining({ metadata: expect.objectContaining({ emailSent: false }) }),
    );
  });

  it('reports the same outcome when an existing user is added directly', async () => {
    const activeUser = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u_real', passwordHash: '$2a$hash' }) },
    };
    const { service, mail } = makeService(activeUser);
    (mail.sendAddedNotice as unknown as jest.Mock).mockResolvedValue(false);

    const result = await service.invite(TENANT, { email: 'a@b.co', role: 'EMPLOYEE' });

    expect(result).toEqual({ status: 'added', email: 'a@b.co', emailSent: false });
  });
});
