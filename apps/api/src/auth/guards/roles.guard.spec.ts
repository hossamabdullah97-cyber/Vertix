import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@vertex/shared';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * The guard that stands between an EMPLOYEE and their organization's billing,
 * member list and audit log. A permissive default here is a privilege
 * escalation, so every case asserts the deny side too.
 */

/** A context whose reflector answers exactly what the route declared. */
function contextFor(meta: { roles?: Role[]; isPublic?: boolean }, tenant?: unknown) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return meta.isPublic;
      if (key === ROLES_KEY) return meta.roles;
      return undefined;
    },
  } as unknown as Reflector;

  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
  } as unknown as ExecutionContext;

  return { guard: new RolesGuard(reflector), ctx };
}

const asRole = (role: Role) => ({ orgId: 'org_acme', userId: 'u1', role });

describe('RolesGuard', () => {
  it('allows a route that declares no roles', () => {
    const { guard, ctx } = contextFor({}, asRole('EMPLOYEE'));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows a public route before looking at anything else', () => {
    const { guard, ctx } = contextFor({ isPublic: true, roles: ['OWNER'] }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admits a role that is on the list', () => {
    const { guard, ctx } = contextFor({ roles: ['OWNER', 'ADMIN'] }, asRole('ADMIN'));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a role that is not on the list', () => {
    const { guard, ctx } = contextFor({ roles: ['OWNER', 'ADMIN'] }, asRole('EMPLOYEE'));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('does not treat OWNER as a wildcard — the list is exact', () => {
    // If a route is for MANAGERs only, an OWNER is still not a MANAGER. This
    // documents the current contract so a future "owners can do anything"
    // shortcut is a deliberate change, not an accident.
    const { guard, ctx } = contextFor({ roles: ['MANAGER'] }, asRole('OWNER'));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no tenant at all rather than falling through', () => {
    const { guard, ctx } = contextFor({ roles: ['OWNER'] }, undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects an unknown or malformed role', () => {
    const { guard, ctx } = contextFor(
      { roles: ['OWNER'] },
      { orgId: 'org_acme', userId: 'u1', role: 'SUPERUSER' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a tenant carrying no role', () => {
    const { guard, ctx } = contextFor(
      { roles: ['EMPLOYEE'] },
      { orgId: 'org_acme', userId: 'u1' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('applies each role in the list independently', () => {
    const allowed: Role[] = ['OWNER', 'ADMIN'];
    const denied: Role[] = ['MANAGER', 'EMPLOYEE'];
    for (const role of allowed) {
      const { guard, ctx } = contextFor({ roles: allowed }, asRole(role));
      expect(guard.canActivate(ctx)).toBe(true);
    }
    for (const role of denied) {
      const { guard, ctx } = contextFor({ roles: allowed }, asRole(role));
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    }
  });

  it('treats an empty roles array as "no restriction", not "deny everyone"', () => {
    const { guard, ctx } = contextFor({ roles: [] }, asRole('EMPLOYEE'));
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
