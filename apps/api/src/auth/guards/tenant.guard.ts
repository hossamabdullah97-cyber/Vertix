import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@vertex/shared';
import { ADMIN_ORG } from '@vertex/db';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_SCOPE_KEY } from '../decorators/platform-scope.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves the active organization for the request and verifies the user's
 * membership in it. The organization is taken from the x-organization-id header
 * or from the JWT. The role is read from the DB membership (source of truth),
 * not from the token. The result is attached to req.tenant and read by
 * TenantInterceptor to enable automatic isolation.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (!user) return true; // JwtAuthGuard handles rejection when required.

    // A workspace API key already carries its one organization and has no
    // membership row, so its tenant is taken straight from the key. (A PAT
    // carries a real userId and falls through to the normal member path.)
    const apiAuth = req.apiAuth as { kind: string } | undefined;
    if (apiAuth?.kind === 'api_key' && user.orgId) {
      req.tenant = { orgId: user.orgId, userId: user.sub, role: 'OWNER' };
      return true;
    }

    const headerOrg = req.headers['x-organization-id'] as string | undefined;
    const orgId = headerOrg || user.orgId;

    // The cross-org sentinel is only ever handed out on a route that asks for
    // it by name. It disables orgId injection in the Prisma layer, so reaching
    // it by falling through — an absent orgId, say — would silently turn a
    // tenant-scoped query into a platform-wide one.
    const wantsPlatformScope = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (wantsPlatformScope) {
      if (!user.isSuperAdmin) {
        throw new ForbiddenException('Platform administration is not available to this account');
      }
      req.tenant = { orgId: ADMIN_ORG, userId: user.sub, role: 'OWNER' };
      return true;
    }

    if (user.isSuperAdmin) {
      // A platform admin may enter any organization without a membership row,
      // but only a real one — never the sentinel.
      if (!orgId) return true;
      const orgExists = await this.prisma.client.organization.findUnique({
        where: { id: orgId },
        select: { id: true, isActive: true, deletedAt: true },
      });
      if (!orgExists || !orgExists.isActive || orgExists.deletedAt) {
        const defaultMember = await this.prisma.client.membership.findFirst({
          where: { userId: user.sub, status: 'ACTIVE' },
          select: { orgId: true },
        });
        if (defaultMember) {
          req.tenant = { orgId: defaultMember.orgId, userId: user.sub, role: 'OWNER' };
          return true;
        }
        throw new ForbiddenException('Selected organization does not exist');
      }
      req.tenant = { orgId, userId: user.sub, role: 'OWNER' };
      return true;
    }

    if (!orgId) return true; // User-level route without an organization (e.g. /auth/me).

    const membership = await this.prisma.client.membership.findFirst({
      where: { userId: user.sub, orgId, status: 'ACTIVE' },
      select: {
        role: true,
        org: {
          select: {
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }
    if (!membership.org.isActive || membership.org.deletedAt) {
      throw new ForbiddenException('This organization is currently suspended or deleted');
    }

    req.tenant = { orgId, userId: user.sub, role: membership.role };
    return true;
  }
}
