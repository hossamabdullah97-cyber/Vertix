import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasCapability, type Role } from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AREA_KEY } from '../decorators/area.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Whether a member may use a route that needs one of `required` roles.
 *
 * A built-in role is checked as it always was. A custom role is checked by
 * what it was given in the route's area: a route open to managers needs the
 * area's basic level, one for admins its full level. A route for owners
 * only, one that changes roles, or one with no area is never reached through
 * a custom role (it then needs the built-in role underneath).
 */
export function allowed(tenant: Pick<TenantContext, 'role' | 'customRole'>, required: readonly string[], area: string | undefined): boolean {
  if (required.includes('EMPLOYEE')) return required.includes(tenant.role);
  const custom = tenant.customRole;
  if (!custom || !area) return required.includes(tenant.role);
  if (area === 'roles' || !required.includes('ADMIN')) return false;
  return hasCapability(custom.capabilities, area, required.includes('MANAGER') ? 'basic' : 'full');
}

/**
 * Enforces the required roles (@Roles) on a route.
 * Relies on req.tenant.role set by TenantGuard from the DB membership.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const tenant = req.tenant as TenantContext | undefined;
    if (!tenant) {
      throw new ForbiddenException('An active organization is required');
    }
    const area = this.reflector.getAllAndOverride<string | undefined>(AREA_KEY, [context.getHandler(), context.getClass()]);
    if (!allowed(tenant, required, area)) {
      throw new ForbiddenException('Your role does not permit this action');
    }
    return true;
  }
}
