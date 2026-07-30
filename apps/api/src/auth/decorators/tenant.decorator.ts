import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';

/** Extracts the active tenant context (orgId, userId, role) from the request. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    return ctx.switchToHttp().getRequest().tenant;
  },
);

/** Shortcut to extract the active organization's orgId. */
export const OrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest().tenant?.orgId;
  },
);
