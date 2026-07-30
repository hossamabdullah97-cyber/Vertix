import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard, type ApiAuth } from './scopes.guard';
import { SCOPES_KEY } from './scopes.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

/**
 * The gate a narrow token hits. It must fail closed for machines and stay out
 * of the way for humans (who are governed by roles, not scopes).
 */

function ctxFor(
  meta: { scopes?: string[]; isPublic?: boolean },
  apiAuth?: ApiAuth,
) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? meta.isPublic : key === SCOPES_KEY ? meta.scopes : undefined,
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ apiAuth }) }),
  } as unknown as ExecutionContext;
  return { guard: new ScopesGuard(reflector), ctx };
}

const key = (scopes: string[]): ApiAuth => ({ kind: 'api_key', id: 'k1', scopes });

describe('ScopesGuard', () => {
  it('allows a route that requires no scopes', () => {
    const { guard, ctx } = ctxFor({}, key([]));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lets a human (no apiAuth) through — roles govern them', () => {
    const { guard, ctx } = ctxFor({ scopes: ['crm:write'] }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admits a machine holding the required scope', () => {
    const { guard, ctx } = ctxFor({ scopes: ['crm:read'] }, key(['crm:read']));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a machine missing the required scope', () => {
    const { guard, ctx } = ctxFor({ scopes: ['crm:write'] }, key(['crm:read']));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('requires every scope when several are demanded', () => {
    const { guard, ctx } = ctxFor({ scopes: ['crm:read', 'crm:write'] }, key(['crm:read']));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('honours a resource wildcard grant', () => {
    const { guard, ctx } = ctxFor({ scopes: ['crm:write'] }, key(['crm:*']));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('skips scope checks entirely on a public route', () => {
    const { guard, ctx } = ctxFor({ isPublic: true, scopes: ['crm:write'] }, key([]));
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
