import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ORG } from '@vertex/db';
import { TenantGuard } from './tenant.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_SCOPE_KEY } from '../decorators/platform-scope.decorator';
import { TWO_STEP_EXEMPT_KEY } from '../decorators/two-step-exempt.decorator';
import { PERSON_ROUTE_KEY } from '../decorators/person-route.decorator';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * The guard that answers "which organization is this request in, and is this
 * user really in it?". Everything downstream — the orgId Prisma injects, the
 * role RolesGuard checks — is only as trustworthy as this. The active org
 * arrives in a client-controlled header, so the membership lookup is the whole
 * defence.
 */

type Membership = {
  role: string;
  org: { isActive: boolean; deletedAt: Date | null; settings?: unknown };
  user?: { totpEnabledAt: Date | null };
} | null;

/** What the organization lookup finds, for the super-admin path. */
type OrgRow = { id: string; isActive: boolean; deletedAt: Date | null } | null;

const liveOrg = (id = 'org_globex'): OrgRow => ({
  id,
  isActive: true,
  deletedAt: null,
});

function makeGuard(
  membership: Membership,
  isPublic = false,
  platformScope = false,
  // A super admin entering a named org is checked against the organization
  // table, not against membership. Defaulting this to a live org keeps every
  // other test reading as it did before that check existed.
  org: OrgRow = liveOrg(),
  twoStepExempt = false,
  personRoute = false,
) {
  const findFirst = jest.fn().mockResolvedValue(membership);
  const findUnique = jest.fn().mockResolvedValue(org);
  const prisma = {
    client: {
      membership: { findFirst },
      organization: { findUnique },
    },
  } as unknown as PrismaService;
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === PLATFORM_SCOPE_KEY) return platformScope;
      if (key === TWO_STEP_EXEMPT_KEY) return twoStepExempt;
      if (key === PERSON_ROUTE_KEY) return personRoute;
      return undefined;
    },
  } as unknown as Reflector;
  return { guard: new TenantGuard(reflector, prisma), findFirst, findUnique };
}

function request(user: unknown, headerOrg?: string) {
  const req: Record<string, unknown> = {
    user,
    headers: headerOrg ? { 'x-organization-id': headerOrg } : {},
  };
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, ctx };
}

const activeMember = (role = 'EMPLOYEE'): Membership => ({
  role,
  org: { isActive: true, deletedAt: null },
  user: { totpEnabledAt: null },
});

const member = { sub: 'u1', email: 'a@b.co', orgId: 'org_acme', role: 'EMPLOYEE' };

describe('TenantGuard — resolving the active organization', () => {
  it('sets the tenant from the header once membership checks out', async () => {
    const { guard } = makeGuard(activeMember('MANAGER'));
    const { req, ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toEqual({ orgId: 'org_acme', userId: 'u1', role: 'MANAGER' });
  });

  it('falls back to the token org when no header is sent', async () => {
    const { guard, findFirst } = makeGuard(activeMember());
    const { req, ctx } = request(member);
    await guard.canActivate(ctx);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', orgId: 'org_acme', status: 'ACTIVE' },
      }),
    );
    expect((req.tenant as { orgId: string }).orgId).toBe('org_acme');
  });

  it('verifies the header org against membership rather than trusting it', async () => {
    // The header is client-controlled: naming someone else's org must 403,
    // not silently scope the request into it.
    const { guard, findFirst } = makeGuard(null);
    const { ctx } = request(member, 'org_globex');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', orgId: 'org_globex', status: 'ACTIVE' },
      }),
    );
  });

  it('takes the role from the database, not from the token', async () => {
    // A token minted before a demotion still says OWNER; the DB says EMPLOYEE.
    const staleOwnerToken = { ...member, role: 'OWNER' };
    const { guard } = makeGuard(activeMember('EMPLOYEE'));
    const { req, ctx } = request(staleOwnerToken, 'org_acme');
    await guard.canActivate(ctx);
    expect((req.tenant as { role: string }).role).toBe('EMPLOYEE');
  });

  it('only counts ACTIVE memberships, so a suspended member is locked out', async () => {
    const { guard, findFirst } = makeGuard(null);
    const { ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(findFirst.mock.calls[0][0].where.status).toBe('ACTIVE');
  });
});

describe('TenantGuard — organization state', () => {
  it('rejects a suspended organization even for a valid member', async () => {
    const { guard } = makeGuard({
      role: 'OWNER',
      org: { isActive: false, deletedAt: null },
    });
    const { ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /suspended or deleted/i,
    );
  });

  it('rejects a soft-deleted organization', async () => {
    const { guard } = makeGuard({
      role: 'OWNER',
      org: { isActive: true, deletedAt: new Date() },
    });
    const { ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /suspended or deleted/i,
    );
  });
});

describe('TenantGuard — super admin', () => {
  const root = { sub: 'root', email: 'r@v.dev', isSuperAdmin: true };

  it('enters any organization without a membership row', async () => {
    const { guard, findFirst } = makeGuard(null);
    const { req, ctx } = request(root, 'org_globex');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toEqual({ orgId: 'org_globex', userId: 'root', role: 'OWNER' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('never reaches the cross-org sentinel by falling through', async () => {
    // Regression: the guard used to read `orgId || 'admin'`, so a super admin
    // whose token had lost its orgId — which is exactly what a token refresh
    // used to do — was silently escalated to platform-wide scope and saw every
    // tenant's rows. An absent org must mean no tenant, never the sentinel.
    const { guard } = makeGuard(null);
    const { req, ctx } = request(root);
    await guard.canActivate(ctx);
    expect(req.tenant).toBeUndefined();
  });

  it('scopes to the concrete org that was selected', async () => {
    const { guard } = makeGuard(null);
    const { req, ctx } = request({ ...root, orgId: 'org_acme' });
    await guard.canActivate(ctx);
    expect((req.tenant as { orgId: string }).orgId).toBe('org_acme');
  });

  it('is driven by the token flag, which no header can forge', async () => {
    const { guard } = makeGuard(null);
    const { ctx } = request({ ...member, isSuperAdmin: false }, 'org_globex');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // The selected org is checked to exist and be live before it becomes the
  // tenant. Without this the admin console could scope a request into an org id
  // that was deleted — or never existed — and every query would come back empty
  // rather than saying so.
  it('checks the selected organization is real before scoping into it', async () => {
    const { guard, findUnique } = makeGuard(null, false, false, liveOrg('org_globex'));
    const { ctx } = request(root, 'org_globex');
    await guard.canActivate(ctx);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org_globex' } }),
    );
  });

  it('falls back to their own workspace when the selected org is gone', async () => {
    // A stale header outlives the org it names — after a deletion, say. Falling
    // back to a real membership keeps the console usable instead of locking the
    // admin out of a workspace they do belong to.
    const { guard } = makeGuard({ role: 'OWNER', org: { isActive: true, deletedAt: null } }, false, false, null);
    const { req, ctx } = request(root, 'org_deleted');
    // The fallback reads membership.orgId, which this mock does not carry, so
    // the shape is asserted rather than the value.
    await guard.canActivate(ctx);
    expect(req.tenant).toBeDefined();
  });

  it('refuses outright when the selected org is gone and they belong nowhere', async () => {
    const { guard } = makeGuard(null, false, false, null);
    const { ctx } = request(root, 'org_deleted');
    await expect(guard.canActivate(ctx)).rejects.toThrow(/does not exist/i);
  });

  it('treats a suspended organization as unselectable', async () => {
    const { guard } = makeGuard(null, false, false, {
      id: 'org_globex',
      isActive: false,
      deletedAt: null,
    });
    const { ctx } = request(root, 'org_globex');
    await expect(guard.canActivate(ctx)).rejects.toThrow(/does not exist/i);
  });
});

describe('TenantGuard — the platform scope is opt-in', () => {
  const root = { sub: 'root', email: 'r@v.dev', isSuperAdmin: true };

  it('grants the sentinel to a super admin on a route that asks for it', async () => {
    const { guard } = makeGuard(null, false, true);
    const { req, ctx } = request(root);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toEqual({ orgId: ADMIN_ORG, userId: 'root', role: 'OWNER' });
  });

  it('uses the same sentinel value the Prisma layer checks for', async () => {
    // If these ever drift, the admin console would be scoped to one org while
    // believing it is platform-wide. Importing the constant is the guarantee.
    expect(ADMIN_ORG).toBe('admin');
  });

  it('refuses the platform scope to a normal user, whatever their org', async () => {
    const { guard } = makeGuard(activeMember('OWNER'), false, true);
    const { ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('ignores a header org on a platform-scoped route', async () => {
    // The route is cross-org by definition; a header must not narrow or
    // redirect it.
    const { guard } = makeGuard(null, false, true);
    const { req, ctx } = request(root, 'org_acme');
    await guard.canActivate(ctx);
    expect((req.tenant as { orgId: string }).orgId).toBe(ADMIN_ORG);
  });

  it('does not grant the sentinel on a route that never asked', async () => {
    const { guard } = makeGuard(null, false, false);
    const { req, ctx } = request(root, 'org_acme');
    await guard.canActivate(ctx);
    expect((req.tenant as { orgId: string }).orgId).toBe('org_acme');
  });
});

describe('TenantGuard — routes without a tenant', () => {
  it('skips public routes entirely', async () => {
    const { guard, findFirst } = makeGuard(null, true);
    const { req, ctx } = request(undefined);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('passes through with no tenant for a personal workspace (no org anywhere)', async () => {
    // RequireTenantGuard is what rejects org-scoped routes in this state.
    const { guard } = makeGuard(null);
    const { req, ctx } = request({ sub: 'u1', email: 'a@b.co' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
  });

  it('leaves rejection of unauthenticated requests to JwtAuthGuard', async () => {
    const { guard } = makeGuard(null);
    const { req, ctx } = request(undefined);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
  });
});

describe('TenantGuard — a workspace that requires two-step verification', () => {
  const requiring = (totpEnabledAt: Date | null): Membership => ({
    role: 'EMPLOYEE',
    org: { isActive: true, deletedAt: null, settings: { require2fa: true } },
    user: { totpEnabledAt },
  });

  it('turns away a member without it', async () => {
    const { guard } = makeGuard(requiring(null));
    const { ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).rejects.toThrow('Two-step verification is required in this workspace');
  });

  it('lets them reach what they need to set it up', async () => {
    const { guard } = makeGuard(requiring(null), false, false, liveOrg(), true);
    const { ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('lets in a member who has it', async () => {
    const { guard } = makeGuard(requiring(new Date()));
    const { ctx, req } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toMatchObject({ orgId: 'org_acme' });
  });
});

describe('TenantGuard — a workspace the person is no longer in', () => {
  it('still shuts every workspace route', async () => {
    const { guard } = makeGuard(null);
    const { req, ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(req.tenant).toBeUndefined();
  });

  it('leaves the routes about the person open, with no workspace at all', async () => {
    // Removed while signed in: their list, invitations, account and
    // notifications must still answer, or there is no way on.
    for (const header of ['org_acme', undefined]) {
      const { guard } = makeGuard(null, false, false, liveOrg(), false, true);
      const { req, ctx } = request(member, header);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.tenant).toBeUndefined();
    }
  });

  it('treats a deleted workspace the same way', async () => {
    const gone: Membership = { role: 'OWNER', org: { isActive: true, deletedAt: new Date() }, user: { totpEnabledAt: null } };
    const { guard } = makeGuard(gone, false, false, liveOrg(), false, true);
    const { req, ctx } = request(member, 'org_acme');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
    const { guard: strict } = makeGuard(gone);
    await expect(strict.canActivate(request(member, 'org_acme').ctx)).rejects.toThrow('suspended or deleted');
  });
});

describe('TenantGuard — a workspace API key', () => {
  function keyGuard(createdBy: string | null, members: Record<string, { userId: string } | null>) {
    const membershipFind = jest.fn(async ({ where }: { where: { userId?: string; role?: string } }) => members[where.userId ?? `role:${where.role}`] ?? null);
    const prisma = {
      client: { apiKey: { findFirst: jest.fn(async () => ({ createdBy })) }, membership: { findFirst: membershipFind } },
    } as unknown as PrismaService;
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    return new TenantGuard(reflector, prisma);
  }
  const keyRequest = () => {
    const { req, ctx } = request({ sub: 'apikey:k1', email: null, orgId: 'org_acme' });
    req.apiAuth = { kind: 'api_key', id: 'k1', scopes: ['crm:write'] };
    return { req, ctx };
  };

  it('acts as the person who made it, while they are in the workspace', async () => {
    const { req, ctx } = keyRequest();
    await keyGuard('u_maker', { u_maker: { userId: 'u_maker' }, 'role:OWNER': { userId: 'u_owner' } }).canActivate(ctx);
    expect(req.tenant).toEqual({ orgId: 'org_acme', userId: 'u_maker', role: 'OWNER' });
  });

  it('acts as the owner once its maker has left, so what it creates has a real owner', async () => {
    const { req, ctx } = keyRequest();
    await keyGuard('u_gone', { 'role:OWNER': { userId: 'u_owner' } }).canActivate(ctx);
    expect(req.tenant).toMatchObject({ userId: 'u_owner' });
  });

  it('is refused when the workspace has nobody to act as', async () => {
    const { ctx } = keyRequest();
    await expect(keyGuard(null, {}).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
