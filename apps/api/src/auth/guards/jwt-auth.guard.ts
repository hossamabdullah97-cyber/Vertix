import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { classifyKey } from '../../access/token-hash';
import { ApiCredentialsService } from '../../access/api-credentials.service';

/**
 * Global authentication. Accepts two kinds of credential:
 *  - a JWT (human sessions), via the passport 'jwt' strategy; and
 *  - an API key / personal access token (machine callers), authenticated here
 *    and attached as req.apiAuth so downstream guards can enforce scopes.
 *
 * @Public() routes bypass both.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly credentials: ApiCredentialsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers?.authorization as string | undefined;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : null;

    // Machine credential path — a key/token rather than a JWT.
    if (raw && classifyKey(raw)) {
      const resolved = await this.credentials.verify(raw);
      if (!resolved) {
        throw new UnauthorizedException('Invalid or expired API credentials');
      }
      if (resolved.kind === 'api_key') {
        // Acts within one workspace; TenantGuard reads orgId straight off this.
        req.user = {
          sub: `apikey:${resolved.id}`,
          email: null,
          orgId: resolved.orgId,
          isSuperAdmin: false,
        };
      } else {
        // A PAT acts as its owning user; TenantGuard resolves their membership.
        req.user = { sub: resolved.userId, email: null, isSuperAdmin: false };
      }
      req.apiAuth = { kind: resolved.kind, id: resolved.id, scopes: resolved.scopes };
      return true;
    }

    // Human path — delegate to the JWT strategy.
    return super.canActivate(context) as Promise<boolean>;
  }
}
