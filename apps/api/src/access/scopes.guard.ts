import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';
import { hasAllScopes } from './scopes';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

/** The machine-principal shape the JwtAuthGuard attaches for key/token callers. */
export interface ApiAuth {
  kind: 'api_key' | 'pat';
  id: string;
  scopes: string[];
}

/**
 * Enforces @RequireScopes for machine callers (API keys, personal access
 * tokens). A human JWT caller carries no `apiAuth` and passes through here —
 * their authority is checked by RolesGuard instead. A machine caller missing
 * any required scope is rejected, so a narrow key cannot reach a broad route.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const apiAuth = req.apiAuth as ApiAuth | undefined;
    if (!apiAuth) return true; // human caller — RolesGuard governs them

    if (!hasAllScopes(apiAuth.scopes, required)) {
      throw new ForbiddenException(
        `This token is missing the required scope(s): ${required.join(', ')}`,
      );
    }
    return true;
  }
}
