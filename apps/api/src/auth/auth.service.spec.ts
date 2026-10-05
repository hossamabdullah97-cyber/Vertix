import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService, SUSPENDED_MESSAGE, ACCOUNT_ACCEPTS_SIGNED_IN } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokensService } from '../mail/tokens.service';
import type { MailService } from '../mail/mail.service';
import type { AuthTokens } from '@vertex/shared';

/**
 * The credential boundary. These assert the deny paths as hard as the allow
 * paths: a permissive branch here is account takeover, and a token that quietly
 * carries the wrong claims is a privilege bug that surfaces far from its cause.
 */

const PASSWORD = 'Password123!';
let HASH = '';
beforeAll(async () => {
  HASH = await bcrypt.hash(PASSWORD, 4); // low cost — these are unit tests
});

type Deps = {
  throttle?: Partial<Record<string, jest.Mock>>;
  user?: Partial<Record<string, jest.Mock>>;
  membership?: Partial<Record<string, jest.Mock>>;
  organization?: Partial<Record<string, jest.Mock>>;
  tokens?: Partial<Record<string, jest.Mock>>;
  twoFactor?: Partial<Record<string, jest.Mock>>;
  sessions?: Partial<Record<string, jest.Mock>>;
  signed?: Record<string, unknown>[];
};

/** Wires AuthService with the smallest believable doubles. */
function makeService(d: Deps = {}) {
  const signed: Record<string, unknown>[] = d.signed ?? [];

  const prisma = {
    client: {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ isSuperAdmin: false }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        ...d.user,
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        ...d.membership,
      },
      organization: {
        create: jest.fn().mockResolvedValue({ id: 'org_new' }),
        findFirst: jest.fn().mockResolvedValue({ plan: 'FREE' }),
        ...d.organization,
      },
      pipelineStage: { createMany: jest.fn() },
      $transaction: jest.fn(),
    },
  } as unknown as PrismaService;

  // Run transactions against the same doubles.
  (prisma.client.$transaction as unknown as jest.Mock).mockImplementation(
    (fn: (tx: unknown) => unknown) => fn(prisma.client),
  );

  const jwt = {
    // Record what each token is signed with — the claims are the contract.
    signAsync: jest.fn(async (payload: Record<string, unknown>) => {
      signed.push(payload);
      return `tok_${signed.length}`;
    }),
    verifyAsync: jest.fn(),
  };

  const config = {
    getOrThrow: (k: string) => `secret_${k}`,
    get: (_k: string, dflt?: string) => dflt ?? 'x',
  };

  const tokens = {
    create: jest.fn().mockResolvedValue('raw_token'),
    verify: jest.fn(),
    consume: jest.fn(),
    revokePending: jest.fn(),
    ...d.tokens,
  } as unknown as TokensService;

  const mail = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn().mockResolvedValue(true) } as unknown as MailService;

  const throttle = {
    blockedFor: jest.fn().mockResolvedValue(0),
    hit: jest.fn().mockResolvedValue(1),
    clear: jest.fn(),
    ...d.throttle,
  };

  const twoFactor = { challenge: jest.fn(async (sub: string) => ({ mfaRequired: true, mfaToken: `mfa_${sub}` })), ...d.twoFactor };

  const sessions = {
    start: jest.fn().mockResolvedValue('sess_1'),
    renew: jest.fn().mockResolvedValue(true),
    revoke: jest.fn().mockResolvedValue({ ok: true }),
    revokeAll: jest.fn().mockResolvedValue({ count: 0 }),
    ...d.sessions,
  };

  const service = new AuthService(
    prisma,
    jwt as never,
    config as never,
    tokens,
    mail,
    throttle as never,
    twoFactor as never,
    sessions as never,
  );
  return { service, prisma, jwt, tokens, mail, signed, throttle, sessions };
}

/** The access token is the first signAsync call; the refresh token is the second. */
const access = (signed: Record<string, unknown>[]) => signed[0];
const refreshClaims = (signed: Record<string, unknown>[]) => signed[1];

describe('AuthService.login', () => {
  it('asks for a code, and issues no session, when the account has two-step verification', async () => {
    const { service, signed } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH, totpEnabledAt: new Date() }) },
      membership: { findFirst: jest.fn().mockResolvedValue({ orgId: 'org_acme', role: 'MANAGER' }) },
    });
    const out = await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(out).toEqual({ mfaRequired: true, mfaToken: 'mfa_u1' });
    expect(signed).toHaveLength(0);
  });

  it('issues tokens for correct credentials', async () => {
    const { service, signed } = makeService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.co',
          passwordHash: HASH,
        }),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ orgId: 'org_acme', role: 'MANAGER' }),
      },
    });
    const out = (await service.login({ email: 'a@b.co', password: PASSWORD })) as AuthTokens;
    expect(out.accessToken).toBeTruthy();
    expect(out.refreshToken).toBeTruthy();
    expect(access(signed)).toMatchObject({
      sub: 'u1',
      orgId: 'org_acme',
      role: 'MANAGER',
    });
  });

  it('rejects a wrong password', async () => {
    const { service } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH }),
      },
    });
    await expect(
      service.login({ email: 'a@b.co', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown email with the same message as a wrong password', async () => {
    // Identical errors keep the endpoint from confirming which emails exist.
    const { service } = makeService();
    await expect(
      service.login({ email: 'nobody@b.co', password: PASSWORD }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('rejects an account with no password (invited but never activated)', async () => {
    const { service } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: null }),
      },
    });
    await expect(
      service.login({ email: 'a@b.co', password: PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('signs in a user who belongs to no organization', async () => {
    const { service, signed } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH }),
      },
    });
    await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(access(signed)).toMatchObject({ sub: 'u1', orgId: undefined });
  });

  it('picks the oldest membership as the default workspace', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ orgId: 'org_first', role: 'OWNER' });
    const { service } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH }),
      },
      membership: { findFirst },
    });
    await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });

  it('reads isSuperAdmin from the database, never from the request', async () => {
    const { service, signed } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH }),
        findUnique: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
      },
    });
    await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(access(signed).isSuperAdmin).toBe(true);
  });

  it('defaults isSuperAdmin to false when the lookup finds nothing', async () => {
    const { service, signed } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(access(signed).isSuperAdmin).toBe(false);
  });
});

describe('AuthService.register', () => {
  it('refuses an email that already exists', async () => {
    const { service } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    });
    await expect(
      service.register({
        email: 'a@b.co',
        password: PASSWORD,
        organizationName: 'Acme',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' });
    const { service } = makeService({ user: { create } });
    await service.register({
      email: 'a@b.co',
      password: PASSWORD,
      organizationName: 'Acme',
    });
    const stored = create.mock.calls[0][0].data.passwordHash;
    expect(stored).not.toBe(PASSWORD);
    expect(stored).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare(PASSWORD, stored)).resolves.toBe(true);
  });

  it('makes the first user the OWNER of a fresh organization', async () => {
    const membershipCreate = jest.fn();
    const { service, signed } = makeService({
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }) },
      membership: { create: membershipCreate },
    });
    await service.register({
      email: 'a@b.co',
      password: PASSWORD,
      organizationName: 'Acme',
    });
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: 'u1', orgId: 'org_new', role: 'OWNER' },
    });
    expect(access(signed)).toMatchObject({ orgId: 'org_new', role: 'OWNER' });
  });

  it('makes a team workspace in the company’s name, as before, when asked for one or not told', async () => {
    const { service, prisma } = makeService({ user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }) } });
    await service.register({ email: 'a@b.co', password: PASSWORD, organizationName: 'Acme' });
    expect((prisma.client.organization.create as unknown as jest.Mock).mock.calls[0][0].data).toMatchObject({ name: 'Acme', kind: 'TEAM' });
  });

  it('makes a personal workspace in the person’s own name for someone on their own', async () => {
    const { service, prisma } = makeService({ user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }) } });
    await service.register({ email: 'a@b.co', password: PASSWORD, kind: 'personal', name: ' Mona Adel ' });
    expect((prisma.client.organization.create as unknown as jest.Mock).mock.calls[0][0].data).toMatchObject({ name: 'Mona Adel', kind: 'PERSONAL' });
  });

  it('seeds the default pipeline so the CRM is usable immediately', async () => {
    const { service, prisma } = makeService({
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }) },
    });
    await service.register({
      email: 'a@b.co',
      password: PASSWORD,
      organizationName: 'Acme',
    });
    const rows = (prisma.client.pipelineStage.createMany as unknown as jest.Mock).mock
      .calls[0][0].data;
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ name: 'New', order: 0, orgId: 'org_new' });
  });

  it('does not sign a super-admin token just because the caller asked', async () => {
    const { service, signed } = makeService({
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }) },
    });
    await service.register({
      email: 'a@b.co',
      password: PASSWORD,
      organizationName: 'Acme',
      // @ts-expect-error — the schema strips this; assert it cannot sneak through.
      isSuperAdmin: true,
    });
    expect(access(signed).isSuperAdmin).toBe(false);
  });
});

describe('AuthService.refresh', () => {
  it('rejects a token that does not verify', async () => {
    const { service, jwt } = makeService();
    jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
    await expect(service.refresh('nope')).rejects.toThrow(UnauthorizedException);
  });

  it('verifies against the refresh secret, not the access secret', async () => {
    const { service, jwt } = makeService();
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co' });
    await service.refresh('tok');
    expect(jwt.verifyAsync).toHaveBeenCalledWith('tok', {
      secret: 'secret_JWT_REFRESH_SECRET',
    });
  });

  it('keeps the refresh token minimal — it must not carry org or role', async () => {
    // The refresh token is long-lived, so it deliberately holds no authority
    // claims. Whatever refresh() needs must therefore be re-derived, not read
    // back out of the token.
    const { service, signed } = makeService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: HASH }),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ orgId: 'org_acme', role: 'OWNER' }),
      },
    });
    await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(refreshClaims(signed)).toEqual({
      sub: 'u1',
      email: 'a@b.co',
      isSuperAdmin: false,
      // Only which device it belongs to, so it can be signed out.
      sid: 'sess_1',
    });
  });

  it('rebuilds org and role on refresh instead of losing them', async () => {
    // Regression: refresh() read orgId/role off the refresh token, where they
    // never exist, so every refreshed access token came back org-less. The web
    // app hides this by sending x-organization-id; the mobile app, which relies
    // on the token's own orgId, would lose access after the first refresh.
    const { service, jwt, signed } = makeService({
      membership: {
        findFirst: jest.fn().mockResolvedValue({ orgId: 'org_acme', role: 'MANAGER' }),
      },
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co' });
    await service.refresh('tok');
    expect(access(signed)).toMatchObject({
      sub: 'u1',
      orgId: 'org_acme',
      role: 'MANAGER',
    });
  });

  it('re-reads the role from the database, so a demotion takes effect', async () => {
    const { service, jwt, signed } = makeService({
      membership: {
        findFirst: jest.fn().mockResolvedValue({ orgId: 'org_acme', role: 'EMPLOYEE' }),
      },
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co', role: 'OWNER' });
    await service.refresh('tok');
    expect(access(signed).role).toBe('EMPLOYEE');
  });

  it('refreshes a user who belongs to no organization', async () => {
    const { service, jwt, signed } = makeService();
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co' });
    await service.refresh('tok');
    expect(access(signed)).toMatchObject({ sub: 'u1', orgId: undefined });
  });

  it('re-reads isSuperAdmin, so revoking it takes effect on the next refresh', async () => {
    const { service, jwt, signed } = makeService({
      user: { findUnique: jest.fn().mockResolvedValue({ isSuperAdmin: false }) },
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co', isSuperAdmin: true });
    await service.refresh('tok');
    expect(access(signed).isSuperAdmin).toBe(false);
  });
});

describe('signed-in devices', () => {
  const account = { id: 'u1', email: 'a@b.co', passwordHash: '' };

  it('starts one per sign-in, from the browser and address that signed in, and names it in both tokens', async () => {
    const { service, signed, sessions } = makeService({ user: { findFirst: jest.fn().mockResolvedValue({ ...account, passwordHash: HASH }) } });
    await service.login({ email: 'a@b.co', password: PASSWORD }, '1.2.3.4', 'Chrome UA');
    expect(sessions.start).toHaveBeenCalledWith('u1', { ip: '1.2.3.4', userAgent: 'Chrome UA' }, { announce: true });
    expect(access(signed).sid).toBe('sess_1');
    expect(refreshClaims(signed).sid).toBe('sess_1');
  });

  it('does not announce the first device of a new account', async () => {
    const { service, sessions } = makeService({ user: { create: jest.fn().mockResolvedValue({ id: 'u9', email: 'n@b.co' }) } });
    await service.register({ email: 'n@b.co', password: PASSWORD, kind: 'team', organizationName: 'Acme' }, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(sessions.start).toHaveBeenCalledWith('u9', { ip: '1.1.1.1', userAgent: 'UA' }, {});
  });

  it('renews the same device, and refuses one that was signed out', async () => {
    const { service, jwt, signed, sessions } = makeService();
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co', sid: 'sess_7' });
    await service.refresh('tok', { ip: '5.5.5.5' });
    expect(sessions.renew).toHaveBeenCalledWith('sess_7', 'u1', { ip: '5.5.5.5' });
    expect(sessions.start).not.toHaveBeenCalled();
    expect(access(signed).sid).toBe('sess_7');

    sessions.renew.mockResolvedValue(false);
    await expect(service.refresh('tok')).rejects.toThrow(UnauthorizedException);
  });

  it('gives a token from before devices were kept a device of its own', async () => {
    const { service, jwt, signed, sessions } = makeService();
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co' });
    await service.refresh('tok', { userAgent: 'UA' });
    expect(sessions.start).toHaveBeenCalledWith('u1', { userAgent: 'UA' }, {});
    expect(access(signed).sid).toBe('sess_1');
  });

  it('signs out the device a refresh token belongs to, and shrugs at one it cannot read', async () => {
    const { service, jwt, sessions } = makeService();
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co', sid: 'sess_7' });
    await expect(service.logout('tok')).resolves.toEqual({ ok: true });
    expect(sessions.revoke).toHaveBeenCalledWith('u1', 'sess_7');
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(service.logout('old')).resolves.toEqual({ ok: true });
  });

  it('signs every device out when the password is reset', async () => {
    const { service, sessions } = makeService({
      tokens: { verify: jest.fn().mockResolvedValue({ id: 't1', userId: 'u1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ emailVerified: new Date(), isSuperAdmin: false }) },
    });
    await service.resetPassword('t', 'BrandNewPass1!');
    expect(sessions.revokeAll).toHaveBeenCalledWith('u1');
  });
});

describe('AuthService.forgotPassword', () => {
  it('reports success for an unknown email without sending anything', async () => {
    // Never reveal whether an account exists.
    const { service, mail, tokens } = makeService();
    await expect(service.forgotPassword('ghost@b.co')).resolves.toEqual({ ok: true });
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('mails a one-hour link for a real account', async () => {
    const { service, mail, tokens } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    });
    await service.forgotPassword('a@b.co');
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PASSWORD_RESET', userId: 'u1', ttlMs: 3_600_000 }),
    );
    const [, link] = (mail.sendPasswordReset as unknown as jest.Mock).mock.calls[0];
    expect(link).toContain('/reset-password?token=raw_token');
  });
});

describe('AuthService.resetPassword', () => {
  it('rejects a token that does not verify', async () => {
    const { service, tokens } = makeService();
    (tokens.verify as unknown as jest.Mock).mockRejectedValue(
      new UnauthorizedException('bad'),
    );
    await expect(service.resetPassword('bad', PASSWORD)).rejects.toThrow();
  });

  it('rejects a token that carries no user', async () => {
    const { service, tokens } = makeService();
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: null });
    await expect(service.resetPassword('t', PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('hashes the new password and burns the token so it cannot be reused', async () => {
    const update = jest.fn().mockResolvedValue({});
    const { service, tokens } = makeService({ user: { update } });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1' });
    await service.resetPassword('t', 'BrandNewPass1!');
    const stored = update.mock.calls[0][0].data.passwordHash;
    await expect(bcrypt.compare('BrandNewPass1!', stored)).resolves.toBe(true);
    expect(tokens.consume).toHaveBeenCalledWith('t1');
  });
});

describe('AuthService.acceptInvite', () => {
  it('rejects an invitation missing its user or organization', async () => {
    const { service, tokens } = makeService();
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1' });
    await expect(service.acceptInvite('t', PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('is not for someone who already has an account: their password stays theirs', async () => {
    for (const holder of [{ passwordHash: '$2a$hash', googleId: null }, { passwordHash: null, googleId: 'g-1' }]) {
      const userUpdate = jest.fn().mockResolvedValue({});
      const membershipUpdate = jest.fn().mockResolvedValue({});
      const { service, tokens } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(holder), update: userUpdate }, membership: { update: membershipUpdate } });
      (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1', orgId: 'org_acme', email: 'a@b.co' });
      await expect(service.acceptInvite('t', PASSWORD)).rejects.toThrow(ACCOUNT_ACCEPTS_SIGNED_IN);
      expect(userUpdate).not.toHaveBeenCalled();
      expect(membershipUpdate).not.toHaveBeenCalled();
      expect(tokens.consume).not.toHaveBeenCalled();
    }
  });

  it('activates the membership, verifies the email and burns the token', async () => {
    const userUpdate = jest.fn().mockResolvedValue({});
    const membershipUpdate = jest.fn().mockResolvedValue({});
    const { service, tokens } = makeService({
      user: { update: userUpdate },
      membership: { update: membershipUpdate },
    });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      orgId: 'org_acme',
      email: 'a@b.co',
      role: 'MANAGER',
    });
    await service.acceptInvite('t', PASSWORD, 'Jane');

    expect(userUpdate.mock.calls[0][0].data.emailVerified).toBeInstanceOf(Date);
    expect(userUpdate.mock.calls[0][0].data.name).toBe('Jane');
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { userId_orgId: { userId: 'u1', orgId: 'org_acme' } },
      data: { status: 'ACTIVE' },
    });
    expect(tokens.consume).toHaveBeenCalledWith('t1');
  });

  it('grants the role the invitation named, defaulting to EMPLOYEE', async () => {
    const { service, tokens, signed } = makeService();
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      orgId: 'org_acme',
      email: 'a@b.co',
      role: null,
    });
    await service.acceptInvite('t', PASSWORD);
    expect(access(signed).role).toBe('EMPLOYEE');
  });

  it('stores the password the invitee chose, which no one else ever supplies', async () => {
    // The inviter picks the email and the role; the password enters the system
    // for the first time here, from the person accepting.
    const userUpdate = jest.fn().mockResolvedValue({});
    const { service, tokens } = makeService({ user: { update: userUpdate } });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      orgId: 'org_acme',
      email: 'a@b.co',
    });

    await service.acceptInvite('t', 'ChosenByTheEmployee1!');

    const stored = userUpdate.mock.calls[0][0].data.passwordHash;
    expect(stored).not.toBe('ChosenByTheEmployee1!'); // hashed, never at rest
    await expect(bcrypt.compare('ChosenByTheEmployee1!', stored)).resolves.toBe(true);
  });

  it('does not overwrite an existing name when none is supplied', async () => {
    const userUpdate = jest.fn().mockResolvedValue({});
    const { service, tokens } = makeService({ user: { update: userUpdate } });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      orgId: 'org_acme',
      email: 'a@b.co',
    });
    await service.acceptInvite('t', PASSWORD);
    expect(userUpdate.mock.calls[0][0].data).not.toHaveProperty('name');
  });
});

describe('AuthService.getPlanBadge', () => {
  it('is unverified for a personal workspace with no organization', async () => {
    const { service } = makeService();
    await expect(service.getPlanBadge(undefined)).resolves.toEqual({
      plan: 'FREE',
      verified: false,
    });
  });

  it('is unverified for the platform-admin sentinel, which is not a real org', async () => {
    const { service } = makeService();
    await expect(service.getPlanBadge('admin')).resolves.toEqual({
      plan: 'FREE',
      verified: false,
    });
  });

  it('reads the badge from the organization plan', async () => {
    const { service } = makeService({
      organization: { findFirst: jest.fn().mockResolvedValue({ plan: 'BUSINESS' }) },
    });
    await expect(service.getPlanBadge('org_acme')).resolves.toEqual({
      plan: 'BUSINESS',
      verified: true,
    });
  });

  it('falls back to FREE for a missing or deleted organization', async () => {
    const { service } = makeService({
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getPlanBadge('org_gone')).resolves.toEqual({
      plan: 'FREE',
      verified: false,
    });
  });
});

describe('AuthService: who may start a session', () => {
  const account = { id: 'u1', email: 'omar@acme.co', passwordHash: '' };
  beforeAll(() => {
    account.passwordHash = HASH;
  });

  /** Memberships by status, as the database would answer each lookup. */
  const byStatus = (rows: Record<string, unknown>) =>
    jest.fn(async ({ where }: { where: { status?: string } }) => rows[where.status ?? ''] ?? null);

  it('finds the account whatever case the email is typed in, and never a deleted one', async () => {
    const findFirst = jest.fn().mockResolvedValue(account);
    const { service } = makeService({ user: { findFirst } });
    await service.login({ email: '  Omar@Acme.co ', password: PASSWORD });
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'Omar@Acme.co', mode: 'insensitive' }, deletedAt: null },
    });
  });

  it('opens the oldest workspace the person is still active in', async () => {
    const findFirst = byStatus({ ACTIVE: { orgId: 'org_active', role: 'MANAGER' } });
    const { service, signed } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue(account) },
      membership: { findFirst },
    });
    await service.login({ email: account.email, password: PASSWORD });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
    );
    expect(access(signed)).toMatchObject({ orgId: 'org_active', role: 'MANAGER' });
  });

  it('refuses someone suspended from every workspace, saying so', async () => {
    const { service, signed } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue(account) },
      membership: { findFirst: byStatus({ SUSPENDED: { id: 'm1' } }) },
    });
    await expect(service.login({ email: account.email, password: PASSWORD })).rejects.toThrow(ForbiddenException);
    await expect(service.login({ email: account.email, password: PASSWORD })).rejects.toThrow(SUSPENDED_MESSAGE);
    expect(signed).toHaveLength(0);
  });

  it('still checks the password before saying an account is suspended', async () => {
    const { service } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue(account) },
      membership: { findFirst: byStatus({ SUSPENDED: { id: 'm1' } }) },
    });
    await expect(service.login({ email: account.email, password: 'wrong-password' })).rejects.toThrow('Invalid credentials');
  });

  it('lets a platform admin in even when suspended from their workspaces', async () => {
    const { service, signed } = makeService({
      user: {
        findFirst: jest.fn().mockResolvedValue(account),
        findUnique: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
      },
      membership: { findFirst: byStatus({ SUSPENDED: { id: 'm1' } }) },
    });
    await service.login({ email: account.email, password: PASSWORD });
    expect(access(signed)).toMatchObject({ sub: 'u1', orgId: undefined, isSuperAdmin: true });
  });

  it('stores a new account in lower case and refuses the same address in another case', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u2', email: 'new@acme.co' });
    const { service } = makeService({ user: { create } });
    await service.register({ email: ' New@Acme.co', password: PASSWORD, organizationName: 'Acme' });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'new@acme.co' }) });

    const taken = makeService({ user: { findFirst: jest.fn().mockResolvedValue(account) } });
    await expect(
      taken.service.register({ email: 'OMAR@acme.co', password: PASSWORD, organizationName: 'Acme' }),
    ).rejects.toThrow(ConflictException);
    expect(taken.prisma.client.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'omar@acme.co', mode: 'insensitive' } },
    });
  });

  it('does not renew the session of a deleted account', async () => {
    const { service, jwt } = makeService({
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: new Date(), isSuperAdmin: false }) },
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co' });
    await expect(service.refresh('tok')).rejects.toThrow(UnauthorizedException);
  });

  it('does not renew the session of someone suspended since signing in', async () => {
    const { service, jwt } = makeService({
      membership: { findFirst: byStatus({ SUSPENDED: { id: 'm1' } }) },
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@b.co' });
    await expect(service.refresh('tok')).rejects.toThrow(ForbiddenException);
  });

  it('sends the reset link to the address on the account, whatever case was typed', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'u1', email: 'omar@acme.co' });
    const { service, mail, tokens } = makeService({ user: { findFirst } });
    await service.forgotPassword('OMAR@acme.co');
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'OMAR@acme.co', mode: 'insensitive' }, deletedAt: null },
    });
    expect(tokens.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'omar@acme.co' }));
    expect((mail.sendPasswordReset as unknown as jest.Mock).mock.calls[0][0]).toBe('omar@acme.co');
  });
});

describe('AuthService: sign-in limits', () => {
  const account = { id: 'u1', email: 'omar@acme.co', passwordHash: '' };
  beforeAll(() => {
    account.passwordHash = HASH;
  });

  it('refuses at once while blocked, without looking at the password', async () => {
    const findFirst = jest.fn().mockResolvedValue(account);
    const { service, throttle } = makeService({
      user: { findFirst },
      throttle: { blockedFor: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(420) },
    });
    const err = await service.login({ email: 'Omar@Acme.co', password: PASSWORD }, '1.2.3.4').catch((e) => e);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({ retryAfter: 420, message: expect.stringMatching(/7 minutes/) });
    expect(findFirst).not.toHaveBeenCalled();
    expect(throttle.blockedFor).toHaveBeenCalledWith('sign-in:1.2.3.4:omar@acme.co', 5, 15 * 60_000);
    expect(throttle.blockedFor).toHaveBeenCalledWith('sign-in:omar@acme.co', 20, 15 * 60_000);
  });

  it('counts a wrong password against the account and against the account from this address', async () => {
    const { service, throttle } = makeService({ user: { findFirst: jest.fn().mockResolvedValue(account) } });
    await expect(service.login({ email: account.email, password: 'wrong-password' }, '1.2.3.4')).rejects.toThrow('Invalid credentials');
    expect(throttle.hit).toHaveBeenCalledWith('sign-in:1.2.3.4:omar@acme.co', 15 * 60_000);
    expect(throttle.hit).toHaveBeenCalledWith('sign-in:omar@acme.co', 15 * 60_000);
    expect(throttle.clear).not.toHaveBeenCalled();
  });

  it('counts an unknown email the same way, so the limit reveals no accounts', async () => {
    const { service, throttle } = makeService();
    await expect(service.login({ email: 'ghost@acme.co', password: PASSWORD }, '1.2.3.4')).rejects.toThrow('Invalid credentials');
    expect(throttle.hit).toHaveBeenCalledTimes(2);
  });

  it('starts the count again after a successful sign-in', async () => {
    const { service, throttle } = makeService({ user: { findFirst: jest.fn().mockResolvedValue(account) } });
    await service.login({ email: account.email, password: PASSWORD }, '1.2.3.4');
    expect(throttle.clear).toHaveBeenCalledWith('sign-in:1.2.3.4:omar@acme.co', 'sign-in:omar@acme.co');
    expect(throttle.hit).not.toHaveBeenCalled();
  });

  it('stops sending reset links to an address that asked too often, whether or not it has an account', async () => {
    const { service, mail, tokens, throttle } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue(account) },
      throttle: { blockedFor: jest.fn().mockResolvedValue(1800) },
    });
    const err = await service.forgotPassword('OMAR@acme.co').catch((e) => e);
    expect(err.getStatus()).toBe(429);
    expect(throttle.blockedFor).toHaveBeenCalledWith('reset:omar@acme.co', 5, 60 * 60_000);
    expect(tokens.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('counts each reset request', async () => {
    const { service, throttle } = makeService();
    await service.forgotPassword('ghost@acme.co');
    expect(throttle.hit).toHaveBeenCalledWith('reset:ghost@acme.co', 60 * 60_000);
  });
});

describe('AuthService.google', () => {
  const who = { sub: 'g-1', email: 'Mona@Example.com', emailVerified: true, name: 'Mona Adel', picture: 'https://pic' };

  function google(d: Deps, identity: Record<string, unknown> | Error = who) {
    const ctx = makeService(d);
    const verify = jest.fn(async () => {
      if (identity instanceof Error) throw identity;
      return identity;
    });
    (ctx.service as unknown as { googleVerifier: unknown }).googleVerifier = { verify };
    return ctx;
  }

  it('signs in the account already linked to that Google account', async () => {
    const linked = { id: 'u1', email: 'mona@example.com', googleId: 'g-1', emailVerified: new Date(), avatarUrl: 'a', deletedAt: null };
    const { service, signed, prisma } = google({
      user: { findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? linked : { isSuperAdmin: false })) },
      membership: { findFirst: jest.fn().mockResolvedValue({ orgId: 'org1', role: 'ADMIN' }) },
    });
    await expect(service.google('cred'.repeat(10))).resolves.toEqual({ accessToken: 'tok_1', refreshToken: 'tok_2' });
    expect(access(signed)).toMatchObject({ sub: 'u1', orgId: 'org1', role: 'ADMIN' });
    expect(prisma.client.user.update).not.toHaveBeenCalled();
  });

  it('links an existing account with the same verified email', async () => {
    const existing = { id: 'u2', email: 'mona@example.com', googleId: null, emailVerified: null, avatarUrl: null, name: null, deletedAt: null };
    const { service, prisma } = google({
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? null : { isSuperAdmin: false })),
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({ ...existing, googleId: 'g-1' }),
      },
    });
    await service.google('cred'.repeat(10));
    expect(prisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: expect.objectContaining({ googleId: 'g-1', avatarUrl: 'https://pic', name: 'Mona Adel', emailVerified: expect.any(Date) }),
    });
  });

  it('drops a password set by someone who never proved the inbox', async () => {
    const squatted = { id: 'u5', email: 'mona@example.com', googleId: null, emailVerified: null, passwordHash: 'h', avatarUrl: null, name: 'x', deletedAt: null };
    const { service, prisma } = google({
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? null : { isSuperAdmin: false })),
        findFirst: jest.fn().mockResolvedValue(squatted),
        update: jest.fn().mockResolvedValue({ ...squatted, googleId: 'g-1' }),
      },
    });
    await service.google('cred'.repeat(10));
    expect((prisma.client.user.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ passwordHash: null, googleId: 'g-1' });
  });

  it('keeps the password of an account that had already confirmed its email', async () => {
    const owned = { id: 'u6', email: 'mona@example.com', googleId: null, emailVerified: new Date(), passwordHash: 'h', avatarUrl: null, name: 'x', deletedAt: null };
    const { service, prisma } = google({
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? null : { isSuperAdmin: false })),
        findFirst: jest.fn().mockResolvedValue(owned),
        update: jest.fn().mockResolvedValue({ ...owned, googleId: 'g-1' }),
      },
    });
    await service.google('cred'.repeat(10));
    expect((prisma.client.user.update as jest.Mock).mock.calls[0][0].data).not.toHaveProperty('passwordHash');
  });

  it('creates an account and a workspace for someone new', async () => {
    const { service, prisma, signed } = google({
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? null : { isSuperAdmin: false })),
        create: jest.fn().mockResolvedValue({ id: 'u3', email: 'mona@example.com' }),
      },
    });
    await service.google('cred'.repeat(10));
    expect(prisma.client.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'mona@example.com', name: 'Mona Adel', googleId: 'g-1' }),
    });
    expect((prisma.client.user.create as jest.Mock).mock.calls[0][0].data.passwordHash).toBeUndefined();
    // Google says who they are, not whether there is a team: they start on their own.
    expect(prisma.client.organization.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Mona Adel', kind: 'PERSONAL' }) });
    expect(prisma.client.pipelineStage.createMany).toHaveBeenCalled();
    expect(access(signed)).toMatchObject({ sub: 'u3', orgId: 'org_new', role: 'OWNER' });
  });

  it('refuses an email Google has not verified, before looking anyone up', async () => {
    const { service, prisma } = google({}, { ...who, emailVerified: false });
    await expect(service.google('cred'.repeat(10))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.client.user.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a bad token without saying why', async () => {
    const { GoogleTokenError } = jest.requireActual('./google-id-token');
    const { service } = google({}, new GoogleTokenError('Bad signature'));
    await expect(service.google('cred'.repeat(10))).rejects.toThrow('Google sign-in failed');
  });

  it('will not move an account to a different Google account', async () => {
    const { service } = google({
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? null : { isSuperAdmin: false })),
        findFirst: jest.fn().mockResolvedValue({ id: 'u4', email: 'mona@example.com', googleId: 'g-other', deletedAt: null }),
      },
    });
    await expect(service.google('cred'.repeat(10))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a deleted account', async () => {
    const { service } = google({
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? null : { isSuperAdmin: false })),
        findFirst: jest.fn().mockResolvedValue({ id: 'u5', email: 'mona@example.com', googleId: null, deletedAt: new Date() }),
      },
    });
    await expect(service.google('cred'.repeat(10))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps a suspended member out, as a password sign-in would', async () => {
    const linked = { id: 'u6', email: 'mona@example.com', googleId: 'g-1', emailVerified: new Date(), avatarUrl: 'a', deletedAt: null };
    const { service } = google({
      user: { findUnique: jest.fn().mockImplementation(({ where }) => (where.googleId ? linked : { isSuperAdmin: false })) },
      membership: {
        findFirst: jest.fn().mockImplementation(({ where }) => (where.status === 'SUSPENDED' ? { id: 'm' } : null)),
      },
    });
    await expect(service.google('cred'.repeat(10))).rejects.toThrow(SUSPENDED_MESSAGE);
  });
});

describe('AuthService email confirmation', () => {
  it('mails a confirmation link on sign-up, without making the sign-up wait on it', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' });
    const { service, tokens, mail } = makeService({ user: { create } });
    await service.register({ email: 'a@b.co', password: PASSWORD, organizationName: 'Acme' });
    expect(tokens.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'EMAIL_VERIFY', userId: 'u1', email: 'a@b.co' }));
    expect(mail.sendEmailVerification).toHaveBeenCalledWith('a@b.co', expect.stringContaining('/verify-email?token=raw_token'));
  });

  it('still signs up when the mail cannot be sent', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' });
    const { service, mail } = makeService({ user: { create } });
    (mail.sendEmailVerification as unknown as jest.Mock).mockRejectedValue(new Error('down'));
    await expect(service.register({ email: 'a@b.co', password: PASSWORD, organizationName: 'Acme' })).resolves.toHaveProperty('accessToken');
  });

  it('confirms the address the link was sent to and burns the link', async () => {
    const update = jest.fn().mockResolvedValue({});
    const { service, tokens } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', email: 'A@b.co', emailVerified: null }), update },
    });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1', email: 'a@b.co' });
    await expect(service.verifyEmail('t')).resolves.toEqual({ ok: true, email: 'A@b.co' });
    expect(tokens.verify).toHaveBeenCalledWith('EMAIL_VERIFY', 't');
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailVerified: expect.any(Date) } });
    expect(tokens.consume).toHaveBeenCalledWith('t1');
  });

  it('refuses a link sent to an address the account no longer has', async () => {
    const update = jest.fn();
    const { service, tokens } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', email: 'new@b.co', emailVerified: null }), update },
    });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1', email: 'old@b.co' });
    await expect(service.verifyEmail('t')).rejects.toThrow('Invalid or expired link');
    expect(update).not.toHaveBeenCalled();
  });

  it('sends a new link on request, retiring the old one, within a limit', async () => {
    const { service, tokens, mail, throttle } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ email: 'a@b.co', emailVerified: null }) },
    });
    await expect(service.resendVerification('u1')).resolves.toEqual({ ok: true, emailSent: true });
    expect(tokens.revokePending).toHaveBeenCalledWith('EMAIL_VERIFY', 'u1');
    expect(mail.sendEmailVerification).toHaveBeenCalled();
    expect(throttle.hit).toHaveBeenCalledWith('verify:u1', expect.any(Number));

    (throttle.blockedFor as jest.Mock).mockResolvedValue(60_000);
    await expect(service.resendVerification('u1')).rejects.toThrow();
  });

  it('sends nothing to an account that is already confirmed', async () => {
    const { service, mail } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue({ email: 'a@b.co', emailVerified: new Date() }) },
    });
    await expect(service.resendVerification('u1')).resolves.toEqual({ ok: true, alreadyVerified: true });
    expect(mail.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('counts a password reset as confirming the address', async () => {
    const update = jest.fn().mockResolvedValue({});
    const { service, tokens } = makeService({ user: { update, findUnique: jest.fn().mockResolvedValue({ emailVerified: null }) } });
    (tokens.verify as unknown as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1' });
    await service.resetPassword('t', 'BrandNewPass1!');
    expect(update.mock.calls[0][0].data.emailVerified).toEqual(expect.any(Date));
  });
});
