import { ForbiddenException } from '@nestjs/common';
import { SsoService } from './sso.service';
import type { OidcClaims } from './oidc';

const conn: Record<string, unknown> & { issuer: string; org: unknown } = {
  id: 'c1',
  orgId: 'o1',
  provider: 'OIDC',
  issuer: 'https://idp.example.com',
  clientId: 'client-1',
  clientSecret: 'sealed',
  testedAt: new Date(),
  enforced: false,
  autoJoin: true,
  joinRole: 'EMPLOYEE',
  org: { id: 'o1', deletedAt: null, isActive: true, ssoDomains: [{ domain: 'acme.com' }] },
};

function make(opts: { claims?: Partial<OidcClaims>; connection?: Record<string, unknown>; member?: Record<string, unknown> | null; user?: Record<string, unknown> | null } = {}) {
  const c = { ...conn, ...opts.connection };
  const membershipCreate = jest.fn(async () => ({}));
  const db = {
    ssoConnection: {
      findUnique: jest.fn(async () => c),
      findFirst: jest.fn(async () => c),
      update: jest.fn(async () => c),
    },
    ssoDomain: { count: jest.fn(async () => 1), findFirst: jest.fn(async () => ({ org: { ssoConnection: c } })) },
    ssoIdentity: { findUnique: jest.fn(async () => null), upsert: jest.fn(async () => ({})), delete: jest.fn() },
    user: {
      findFirst: jest.fn(async () => (opts.user === undefined ? null : opts.user)),
      create: jest.fn(async ({ data }: { data: { email: string } }) => ({ id: 'u-new', email: data.email })),
      update: jest.fn(async () => ({})),
    },
    membership: {
      findFirst: jest.fn(async () => opts.member ?? null),
      update: jest.fn(async () => ({})),
      create: membershipCreate,
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const config = { get: (k: string) => ({ APP_PUBLIC_URL: 'https://app.example.com', NODE_ENV: 'test' })[k], getOrThrow: () => 'jwt-secret' };
  const vault = { decrypt: () => 'secret', encrypt: () => 'sealed' };
  const limits = { guard: jest.fn(async (_o: string, _r: string, fn: (tx: unknown) => unknown) => fn(db)) };
  const auth = { ssoSession: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })) };
  const service = new SsoService({ client: db } as never, config as never, vault as never, limits as never, auth as never);
  const claims: OidcClaims = { sub: 'idp-1', email: 'sara@acme.com', emailVerified: true, name: 'Sara', picture: null, hd: null, preferredUsername: null, ...opts.claims };
  service.oidc = {
    discover: jest.fn(async () => ({ issuer: c.issuer, authorization_endpoint: `${c.issuer}/a`, token_endpoint: `${c.issuer}/t`, jwks_uri: `${c.issuer}/k` })),
    exchange: jest.fn(async () => claims),
    authorizationUrl: jest.fn((_d: unknown, p: { state: string }) => `https://idp.example.com/a?state=${p.state}`),
  } as never;
  return { service, db, auth, membershipCreate };
}

async function stateOf(service: SsoService, test = false) {
  const { url } = test ? await service.startTest({ orgId: 'o1', userId: 'admin-1', role: 'ADMIN' }) : await service.start('sara@acme.com');
  return new URL(url).searchParams.get('state')!;
}

describe('SsoService sign-in', () => {
  it('signs a person from a verified domain in, adding them to the workspace', async () => {
    const { service, auth, membershipCreate } = make();
    await service.callback('code', await stateOf(service), {});
    expect(membershipCreate).toHaveBeenCalledWith({ data: { orgId: 'o1', userId: 'u-new', role: 'EMPLOYEE', status: 'ACTIVE' } });
    expect(auth.ssoSession).toHaveBeenCalledWith({ id: 'u-new', email: 'sara@acme.com' }, 'o1', 'EMPLOYEE', {});
  });

  it('refuses an address on a domain the workspace has not verified', async () => {
    const { service, auth } = make({ claims: { email: 'sara@other.com' } });
    await expect(service.callback('code', await stateOf(service), {})).rejects.toThrow('not on a domain this workspace has verified');
    expect(auth.ssoSession).not.toHaveBeenCalled();
  });

  it('refuses an address the provider says is unverified', async () => {
    const { service } = make({ claims: { emailVerified: false } });
    await expect(service.callback('code', await stateOf(service), {})).rejects.toThrow('Single sign-on failed');
  });

  it('with Google, refuses a personal account that is not the company’s', async () => {
    const { service } = make({ connection: { provider: 'GOOGLE' }, claims: { hd: null } });
    await expect(service.callback('code', await stateOf(service), {})).rejects.toThrow(ForbiddenException);
    const ok = make({ connection: { provider: 'GOOGLE' }, claims: { hd: 'acme.com' } });
    await expect(ok.service.callback('code', await stateOf(ok.service), {})).resolves.toBeTruthy();
  });

  it('does not add anyone when the workspace does not add people', async () => {
    const { service, membershipCreate } = make({ connection: { autoJoin: false } });
    await expect(service.callback('code', await stateOf(service), {})).rejects.toThrow('Ask your workspace admin to invite you');
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it('keeps a suspended member out', async () => {
    const { service } = make({ user: { id: 'u1', email: 'sara@acme.com', emailVerified: new Date() }, member: { id: 'm1', role: 'EMPLOYEE', status: 'SUSPENDED', deletedAt: null } });
    await expect(service.callback('code', await stateOf(service), {})).rejects.toThrow('suspended');
  });

  it('a test proves the setup and signs nobody in', async () => {
    const { service, db, auth } = make({ connection: { testedAt: null } });
    await expect(service.callback('code', await stateOf(service, true), {})).resolves.toEqual({ tested: true, email: 'sara@acme.com' });
    expect(db.ssoConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: { testedAt: expect.any(Date) } }));
    expect(auth.ssoSession).not.toHaveBeenCalled();
  });

  it('is not offered before it has been tested', async () => {
    const { service, db } = make();
    db.ssoDomain.findFirst = jest.fn(async () => ({ org: { ssoConnection: { ...conn, testedAt: null } } }));
    await expect(service.start('sara@acme.com')).rejects.toThrow('No single sign-on is set up for this address');
  });

  it('refuses a state that was tampered with', async () => {
    const { service } = make();
    const state = await stateOf(service);
    await expect(service.callback('code', state.slice(0, -4) + 'AAAA', {})).rejects.toThrow('not valid');
  });
});

describe('SsoService settings', () => {
  it('requires it only once tested and with a verified domain', async () => {
    const untested = make({ connection: { testedAt: null } });
    await expect(untested.service.settings({ orgId: 'o1', userId: 'a', role: 'ADMIN' }, { enforced: true })).rejects.toThrow('Test single sign-on before requiring it');
    const noDomain = make();
    noDomain.db.ssoDomain.count = jest.fn(async () => 0);
    await expect(noDomain.service.settings({ orgId: 'o1', userId: 'a', role: 'ADMIN' }, { enforced: true })).rejects.toThrow('Verify a domain before requiring single sign-on');
  });
});
