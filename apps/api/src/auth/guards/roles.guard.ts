import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

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
    if (!required.includes(tenant.role as Role)) {
      throw new ForbiddenException('Your role does not permit this action');
    }
    return true;
  }
}
