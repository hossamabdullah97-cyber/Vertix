import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ORG } from '@vertex/db';
import { TenantGuard } from './tenant.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_SCOPE_KEY } from '../decorators/platform-scope.decorator';
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
  org: { isActive: boolean; deletedAt: Date | null };
} | null;

function makeGuard(
  membership: Membership,
  isPublic = false,
  platformScope = false,
) {
  const findFirst = jest.fn().mockResolvedValue(membership);
  const prisma = { client: { membership: { findFirst } } } as unknown as PrismaService;
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === PLATFORM_SCOPE_KEY) return platformScope;
      return undefined;
    },
  } as unknown as Reflector;
  return { guard: new TenantGuard(reflector, prisma), findFirst };
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
