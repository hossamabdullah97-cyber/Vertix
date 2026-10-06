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
import { TWO_STEP_EXEMPT_KEY } from '../decorators/two-step-exempt.decorator';

export const TWO_STEP_REQUIRED_MESSAGE = 'Two-step verification is required in this workspace';
export const SSO_REQUIRED_MESSAGE = 'This workspace signs in with single sign-on';

/**
 * Whether a member must have arrived through the workspace's single sign-on:
 * it requires it, and their address is on one of its verified domains. Owners
 * are not held to it, so a broken provider can always be fixed from inside.
 */
export function ssoRequired(
  org: { ssoConnection: { enforced: boolean; testedAt: Date | null } | null; ssoDomains: { domain: string }[] },
  role: string,
  email: string,
): boolean {
  if (role === 'OWNER' || !org.ssoConnection?.enforced || !org.ssoConnection.testedAt) return false;
  const domain = email.trim().toLowerCase().split('@')[1];
  return !!domain && org.ssoDomains.some((d) => d.domain === domain);
}

/** Whether a workspace's settings require its members to use two-step verification. */
export function requiresTwoStep(settings: unknown): boolean {
  return !!settings && typeof settings === 'object' && (settings as Record<string, unknown>).require2fa === true;
}
import { PrismaService } from '../../prisma/prisma.service';
import { PERSON_ROUTE_KEY } from '../decorators/person-route.decorator';

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
    const apiAuth = req.apiAuth as { kind: string; id: string } | undefined;
    if (apiAuth?.kind === 'api_key' && user.orgId) {
      req.tenant = { orgId: user.orgId, userId: await this.keyActor(apiAuth.id, user.orgId), role: 'OWNER' };
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
        customRole: { select: { id: true, name: true, capabilities: true } },
        org: {
          select: {
            isActive: true,
            deletedAt: true,
            settings: true,
            ssoConnection: { select: { enforced: true, testedAt: true } },
            ssoDomains: { where: { verifiedAt: { not: null } }, select: { domain: true } },
          },
        },
        user: { select: { totpEnabledAt: true, email: true } },
      },
    });
    if (!membership || !membership.org.isActive || membership.org.deletedAt) {
      // A route about the person goes on without a workspace (see PersonRoute).
      const personRoute = this.reflector.getAllAndOverride<boolean>(PERSON_ROUTE_KEY, [context.getHandler(), context.getClass()]);
      if (personRoute) return true;
      if (!membership) throw new ForbiddenException('You do not have access to this organization');
      throw new ForbiddenException('This organization is currently suspended or deleted');
    }
    // A workspace that requires two-step verification is closed to a member
    // signed in without it, except for setting it up; one that requires its
    // single sign-on, to a member who signed in some other way. Keys and
    // personal tokens are not sign-ins and are held to neither. A sign-in
    // through the workspace's own provider meets its two-step requirement:
    // the company's provider asks for its own second step.
    if (!apiAuth) {
      const exempt = () => this.reflector.getAllAndOverride<boolean>(TWO_STEP_EXEMPT_KEY, [context.getHandler(), context.getClass()]);
      let viaSso: boolean | undefined;
      const signedInViaSso = async () =>
        (viaSso ??= !!user.sid && (await this.prisma.client.authSession.findUnique({ where: { id: user.sid }, select: { ssoOrgId: true } }))?.ssoOrgId === orgId);
      if (ssoRequired(membership.org, membership.role, membership.user.email) && !exempt() && !(await signedInViaSso())) {
        throw new ForbiddenException({ statusCode: 403, message: SSO_REQUIRED_MESSAGE, code: 'SSO_REQUIRED' });
      }
      if (!membership.user.totpEnabledAt && requiresTwoStep(membership.org.settings) && !exempt() && !(await signedInViaSso())) {
        throw new ForbiddenException({ statusCode: 403, message: TWO_STEP_REQUIRED_MESSAGE, code: 'TWO_STEP_REQUIRED' });
      }
    }

    req.tenant = { orgId, userId: user.sub, role: membership.role, customRole: membership.customRole ?? null };
    return true;
  }

  /**
   * Who a workspace key acts as, for whatever it creates (a lead's owner, a
   * card's owner, who wrote a task): the person who made the key while they
   * are still an active member, else the workspace's longest-standing owner.
   * Its scopes still bound what it may do.
   */
  private async keyActor(keyId: string, orgId: string): Promise<string> {
    const key = await this.prisma.client.apiKey.findFirst({ where: { id: keyId, orgId }, select: { createdBy: true } });
    const active = { orgId, status: 'ACTIVE' as const, user: { deletedAt: null } };
    const creator = key?.createdBy
      ? await this.prisma.client.membership.findFirst({ where: { ...active, userId: key.createdBy }, select: { userId: true } })
      : null;
    const actor = creator ?? (await this.prisma.client.membership.findFirst({ where: { ...active, role: 'OWNER' }, orderBy: { createdAt: 'asc' }, select: { userId: true } }));
    if (!actor) throw new ForbiddenException('This key’s workspace has no active owner');
    return actor.userId;
  }
}
