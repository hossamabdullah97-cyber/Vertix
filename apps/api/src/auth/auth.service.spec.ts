import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokensService } from '../mail/tokens.service';
import type { MailService } from '../mail/mail.service';

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
  user?: Partial<Record<string, jest.Mock>>;
  membership?: Partial<Record<string, jest.Mock>>;
  organization?: Partial<Record<string, jest.Mock>>;
  tokens?: Partial<Record<string, jest.Mock>>;
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
    ...d.tokens,
  } as unknown as TokensService;

  const mail = { sendPasswordReset: jest.fn() } as unknown as MailService;

  const service = new AuthService(
    prisma,
    jwt as never,
    config as never,
    tokens,
    mail,
  );
  return { service, prisma, jwt, tokens, mail, signed };
}

/** The access token is the first signAsync call; the refresh token is the second. */
const access = (signed: Record<string, unknown>[]) => signed[0];
const refreshClaims = (signed: Record<string, unknown>[]) => signed[1];

describe('AuthService.login', () => {
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
    const out = await service.login({ email: 'a@b.co', password: PASSWORD });
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
