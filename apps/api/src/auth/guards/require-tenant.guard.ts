import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Ensures an active organization (req.tenant) exists — applied to org-scoped
 * routes. Runs after the global guards, so req.tenant has already been set by
 * TenantGuard.
 */
@Injectable()
export class RequireTenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    if (!req.tenant) {
      throw new ForbiddenException('An active organization is required');
    }
    return true;
  }
}
